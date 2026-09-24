/**
 * Fraction marketplace data layer
 * ===============================
 * Native port of web's `use-fraction-marketplace.ts`: the reads for the
 * fraction market (the whole board, one post's book, offers, trades, and the
 * open obligations on both sides of a swap), against the same Supabase tables.
 *
 * Writes that decide money are not here — they live in `useFractionCheckout`
 * against the `fraction-checkout` edge function, because every one of them is
 * verified against the chain before a row exists. What is left is reads plus
 * the two withdrawals a party may always make of their own accord: cancelling
 * your own listing and withdrawing your own offer. Both are RLS-gated to the
 * row's own address through the wallet header.
 */

import { useEffect, useRef } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";

/** Fractions minted per upload. Every token id is 1000 units, always. */
export const TOTAL_FRACTIONS = 1000;

/** The chain every fraction row defaults to when it does not name one. */
export const DEFAULT_FRACTION_CHAIN = 8453;

export interface FractionListing {
  id: string;
  token_id: string;
  chain_id: number;
  seller_address: string;
  quantity: number;
  filled_quantity: number;
  price_per_fraction: number;
  status: string;
  created_at: string;
  updated_at: string;
  /** Display snapshot taken when the listing was created — never authoritative. */
  post_title: string | null;
  post_image_url: string | null;
  post_type: string | null;
  creator_address: string | null;
  creator_username: string | null;
}

export interface FractionOffer {
  id: string;
  token_id: string;
  chain_id: number;
  buyer_address: string;
  quantity: number;
  price_per_fraction: number;
  status: string;
  target_seller: string | null;
  listing_id: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
}

export type TradeStatus = "awaiting_delivery" | "awaiting_payment" | "settled" | "overdue";

export interface FractionTrade {
  id: string;
  token_id: string;
  chain_id: number;
  seller_address: string;
  buyer_address: string;
  quantity: number;
  price_per_fraction: number;
  total_dhb: number;
  tx_hash: string | null;
  delivery_tx_hash: string | null;
  listing_id: string | null;
  offer_id: string | null;
  status: TradeStatus;
  paid_at: string | null;
  delivered_at: string | null;
  settled_at: string | null;
  settle_by: string | null;
  created_at: string;
}

export interface FractionSellerStats {
  seller_address: string;
  total_trades: number;
  settled_trades: number;
  overdue_trades: number;
  open_trades: number;
  fractions_sold: number;
  avg_settle_seconds: number | null;
}

export type MarketSort = "newest" | "price_asc" | "price_desc" | "quantity_desc";

export const FRACTION_SORTS: { value: MarketSort; labelKey: string }[] = [
  { value: "newest", labelKey: "fractions.sortNewest" },
  { value: "price_asc", labelKey: "fractions.sortCheapest" },
  { value: "price_desc", labelKey: "fractions.sortPriciest" },
  { value: "quantity_desc", labelKey: "fractions.sortBiggestStake" },
];

export const fractionKeys = {
  listings: (tokenId: string) => ["fraction-listings", tokenId] as const,
  offers: (tokenId: string) => ["fraction-offers", tokenId] as const,
  market: (sort: string, search: string) => ["fraction-market", sort, search] as const,
  myListings: (address: string) => ["fraction-my-listings", address] as const,
  myOffers: (address: string) => ["fraction-my-offers", address] as const,
  openTrades: (address: string) => ["fraction-open-trades", address] as const,
  sellerStats: (address: string) => ["fraction-seller-stats", address] as const,
  recentTrades: () => ["fraction-recent-trades"] as const,
};

/** Every query a completed trade, a new listing or a withdrawal can invalidate. */
export function invalidateFractionQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  tokenId?: string,
) {
  if (tokenId) {
    queryClient.invalidateQueries({ queryKey: fractionKeys.listings(tokenId) });
    queryClient.invalidateQueries({ queryKey: fractionKeys.offers(tokenId) });
  }
  for (const key of [
    "fraction-market",
    "fraction-my-listings",
    "fraction-my-offers",
    "fraction-open-trades",
    "fraction-recent-trades",
    "fraction-portfolio",
    "fraction-balance",
  ]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/** The signed-in wallet, lowercased, or "" when signed out. */
export function useFractionWallet(): string {
  const user = useUser() as any;
  return String(user?.walletAddress || user?.address || "").toLowerCase();
}

/**
 * Subscribe a query key to postgres changes on one table.
 *
 * Two mounts sharing a channel topic are not two subscriptions — removing one
 * on unmount takes the other's socket with it — so every instance gets its
 * own suffix, the same fix `useStreamProducts` needed.
 */
function useRealtimeInvalidate(
  channel: string,
  table: string,
  filter: string | undefined,
  queryKey: readonly unknown[],
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const suffix = useRef(Math.random().toString(36).slice(2));
  const serialisedKey = JSON.stringify(queryKey);
  useEffect(() => {
    if (!enabled) return;
    const sub = supabase
      .channel(`${channel}-${suffix.current}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => queryClient.invalidateQueries({ queryKey: JSON.parse(serialisedKey) }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(sub);
    };
  }, [channel, table, filter, enabled, queryClient, serialisedKey]);
}

// ── One post's book ─────────────────────────────────────────────────────────

export function useFractionListings(tokenId: string | undefined) {
  return useQuery({
    queryKey: fractionKeys.listings(tokenId || ""),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraction_listings")
        .select("*")
        .eq("token_id", tokenId!)
        .eq("status", "active")
        .order("price_per_fraction", { ascending: true });
      if (error) throw error;
      return (data || []) as FractionListing[];
    },
    enabled: !!tokenId,
    staleTime: 30_000,
  });
}

// ── The whole market ────────────────────────────────────────────────────────

/**
 * Every open listing across every post.
 *
 * One Supabase query, no /feed round trip per card — that is what the post_*
 * snapshot columns on the listing are for. `search` matches the post title,
 * the creator's username, or a bare token id, because "post 5204" is how
 * people refer to these.
 */
export function useMarketListings(sort: MarketSort = "newest", search = "") {
  const query = useQuery({
    queryKey: fractionKeys.market(sort, search),
    queryFn: async () => {
      let q = supabase.from("fraction_listings").select("*").eq("status", "active");

      const term = search.trim().replace(/[,()]/g, " ");
      if (term) {
        const digits = term.replace(/^#/, "");
        const clauses = [`post_title.ilike.%${term}%`, `creator_username.ilike.%${term}%`];
        if (/^\d+$/.test(digits)) clauses.push(`token_id.eq.${digits}`);
        q = q.or(clauses.join(","));
      }

      if (sort === "price_asc") q = q.order("price_per_fraction", { ascending: true });
      else if (sort === "price_desc") q = q.order("price_per_fraction", { ascending: false });
      else if (sort === "quantity_desc") q = q.order("quantity", { ascending: false });
      else q = q.order("created_at", { ascending: false });

      const { data, error } = await q.limit(60);
      if (error) throw error;
      // A listing whose whole quantity is reserved is still `active` until the
      // reservation lands; a card quoting "0 available" is noise.
      return ((data || []) as FractionListing[]).filter((l) => l.quantity - l.filled_quantity > 0);
    },
    // Typing in the search box keeps the current grid on screen instead of
    // flashing the loader between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 20_000,
  });

  useRealtimeInvalidate("fraction-market", "fraction_listings", undefined, ["fraction-market"], true);

  return query;
}

/** The market tape: what actually traded, newest first. */
export function useRecentTrades(limit = 40) {
  return useQuery({
    queryKey: fractionKeys.recentTrades(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraction_trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as FractionTrade[];
    },
    staleTime: 30_000,
  });
}

// ── Your side of it ─────────────────────────────────────────────────────────

export function useMyListings(address: string) {
  return useQuery({
    queryKey: fractionKeys.myListings(address),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraction_listings")
        .select("*")
        .ilike("seller_address", address)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as FractionListing[];
    },
    enabled: !!address,
    staleTime: 20_000,
  });
}

export function useMyOffers(address: string) {
  return useQuery({
    queryKey: fractionKeys.myOffers(address),
    queryFn: async () => {
      const [made, received] = await Promise.all([
        supabase
          .from("fraction_offers")
          .select("*")
          .ilike("buyer_address", address)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
        supabase
          .from("fraction_offers")
          .select("*")
          .ilike("target_seller", address)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);
      if (made.error) throw made.error;
      if (received.error) throw received.error;
      return {
        made: (made.data || []) as FractionOffer[],
        received: (received.data || []) as FractionOffer[],
      };
    },
    enabled: !!address,
    staleTime: 20_000,
  });
}

export interface OpenTrades {
  /** You owe the fractions — a buyer has already paid for them. */
  toDeliver: FractionTrade[];
  /** You owe the DHB — the fractions are already in your wallet. */
  toPay: FractionTrade[];
  /** Waiting on the other side. */
  waiting: FractionTrade[];
}

/**
 * Swaps with a leg still outstanding, on either side.
 *
 * An open trade here is one whose first leg is already verified on-chain, so
 * it is a real obligation with a named counterparty and a deadline — which is
 * why the screen counts them on the Portfolio tab.
 */
export function useOpenTrades(address: string) {
  const query = useQuery({
    queryKey: fractionKeys.openTrades(address),
    queryFn: async (): Promise<OpenTrades> => {
      const { data, error } = await supabase
        .from("fraction_trades")
        .select("*")
        .or(`seller_address.ilike.${address},buyer_address.ilike.${address}`)
        .in("status", ["awaiting_delivery", "awaiting_payment"])
        .order("settle_by", { ascending: true });
      if (error) throw error;
      const trades = (data || []) as FractionTrade[];
      const isSeller = (t: FractionTrade) => t.seller_address.toLowerCase() === address;
      const isBuyer = (t: FractionTrade) => t.buyer_address.toLowerCase() === address;
      return {
        toDeliver: trades.filter((t) => t.status === "awaiting_delivery" && isSeller(t)),
        toPay: trades.filter((t) => t.status === "awaiting_payment" && isBuyer(t)),
        waiting: trades.filter(
          (t) =>
            (t.status === "awaiting_delivery" && isBuyer(t)) ||
            (t.status === "awaiting_payment" && isSeller(t)),
        ),
      };
    },
    enabled: !!address,
    staleTime: 15_000,
  });

  useRealtimeInvalidate(
    `fraction-open-trades-${address}`,
    "fraction_trades",
    undefined,
    fractionKeys.openTrades(address),
    !!address,
  );

  return query;
}

/**
 * One seller's delivery record. With no escrow contract this is the only thing
 * a buyer can price the counterparty risk on.
 */
export function useSellerStats(address: string | null | undefined) {
  const key = (address || "").toLowerCase();
  return useQuery({
    queryKey: fractionKeys.sellerStats(key),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraction_seller_stats")
        .select("*")
        .eq("seller_address", key)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as FractionSellerStats | null;
    },
    enabled: !!key,
    staleTime: 5 * 60_000,
  });
}

/** Stats for a page's worth of sellers in one query, keyed by address. */
export function useSellerStatsBatch(addresses: string[]) {
  const keys = Array.from(new Set(addresses.map((a) => a.toLowerCase()))).sort();
  return useQuery({
    queryKey: ["fraction-seller-stats-batch", keys.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fraction_seller_stats")
        .select("*")
        .in("seller_address", keys);
      if (error) throw error;
      const map: Record<string, FractionSellerStats> = {};
      for (const row of (data || []) as FractionSellerStats[]) map[row.seller_address] = row;
      return map;
    },
    enabled: keys.length > 0,
    staleTime: 5 * 60_000,
  });
}

// ── Withdrawals and bids ────────────────────────────────────────────────────
// The only writes a party may make unilaterally. RLS gates each to the row's
// own address; everything that moves value goes through the edge function.

export function useCancelListing() {
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  return useMutation({
    mutationFn: async (params: { listingId: string; tokenId: string }) => {
      const query = supabase
        .from("fraction_listings")
        .update({ status: "cancelled" })
        .eq("id", params.listingId);
      const { error } = await withWalletHeader(query as any, wallet) as any;
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => invalidateFractionQueries(queryClient, params.tokenId),
  });
}

export function useCancelOffer() {
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  return useMutation({
    mutationFn: async (params: { offerId: string; tokenId: string }) => {
      const query = supabase
        .from("fraction_offers")
        .update({ status: "cancelled" })
        .eq("id", params.offerId);
      const { error } = await withWalletHeader(query as any, wallet) as any;
      if (error) throw error;
      return params;
    },
    onSuccess: (params) => invalidateFractionQueries(queryClient, params.tokenId),
  });
}

export function useCreateOffer() {
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  return useMutation({
    mutationFn: async (params: {
      tokenId: string;
      quantity: number;
      pricePerFraction: number;
      targetSeller?: string;
      listingId?: string;
      chainId?: number;
    }) => {
      if (!wallet) throw new Error("Sign in first");
      const query = supabase
        .from("fraction_offers")
        .insert({
          token_id: params.tokenId,
          chain_id: params.chainId || DEFAULT_FRACTION_CHAIN,
          buyer_address: wallet,
          quantity: params.quantity,
          price_per_fraction: params.pricePerFraction,
          target_seller: params.targetSeller?.toLowerCase() || null,
          listing_id: params.listingId || null,
        })
        .select()
        .single();
      const { data, error } = await withWalletHeader(query as any, wallet) as any;
      if (error) throw error;
      return data as FractionOffer;
    },
    onSuccess: (data) => invalidateFractionQueries(queryClient, data.token_id),
  });
}
