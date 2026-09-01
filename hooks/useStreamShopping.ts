/**
 * Live shopping data layer
 * ========================
 * Native port of the web app's use-stream-shopping.ts. Same Supabase table
 * (`stream_products`), same edge functions (`stream-products`,
 * `live-checkout`), so both clients see one rail and one order book.
 *
 * Two rules carried over from web, both load-bearing:
 *
 * - **The client never prices anything.** `live-checkout` quotes in DHB and
 *   verifies the transfer on Base before an order row exists. Everything here
 *   is display only. The marketplace path divides `price / dhbPrice` in the
 *   app and sends 0 DHB when that feed returns 0; this path never divides.
 * - **The client never writes.** `stream_products` has no INSERT/UPDATE/DELETE
 *   policy. Writes go through the edge function under the service role, which
 *   checks the caller against the token's minter — RLS here resolves identity
 *   from an unsigned header and could not.
 */

import { useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { dehubAuthHeaders } from "../services/ai.service";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useStreamShopping");

export interface StreamProductListing {
  id: string;
  title: string;
  description: string | null;
  price: number;
  images: string[] | null;
  category: string;
  is_digital: boolean;
  stock_quantity: number | null;
  status: string;
  wallet_address: string;
  shipping_info: string | null;
}

export interface StreamProduct {
  id: string;
  token_id: string;
  listing_id: string;
  creator_address: string;
  position: number;
  is_pinned: boolean;
  pinned_at: string | null;
  live_price: number | null;
  store_listings: StreamProductListing | null;
}

export interface LiveQuote {
  listingId: string;
  title: string;
  priceUsd: number;
  dhbAmount: number;
  dhbPrice: number;
  sellerAddress: string;
  tokenAddress: string;
  chainId: number;
  isDigital: boolean;
  stockRemaining: number | null;
  /** DHB is ERC20Pausable and currently paused; a transfer would revert. */
  paymentsFrozen: boolean;
}

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

async function callFn<T>(
  fn: "stream-products" | "live-checkout",
  body: Record<string, unknown>,
  wallet: string | null,
): Promise<T> {
  const headers = await dehubAuthHeaders(wallet);
  const { data, error } = await supabase.functions.invoke(fn, { body, headers });
  // supabase-js only hands back a body on 2xx and buries the rest in the
  // error's context. Digging it out matters here beyond message quality: the
  // confirm loop keys its retry on the server saying "not found yet", and
  // "Edge Function returned a non-2xx status code" would turn a receipt that
  // simply has not landed into a permanent failure on top of a real payment.
  if (error) {
    let detail = "";
    try {
      const context = (error as { context?: Response }).context;
      if (context) detail = String((await context.json())?.error || "");
    } catch {
      // Body was not JSON — fall back to the transport message.
    }
    throw new Error(detail || error.message || "Request failed");
  }
  if ((data as { error?: string })?.error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Live override beats list price — matches the web rail exactly. */
export function effectivePrice(product: StreamProduct): number {
  return Number(product.live_price ?? product.store_listings?.price ?? 0);
}

/**
 * Attach one listing to a post, outside React.
 *
 * The composer needs this after a mint returns a tokenId, which is not a
 * render — so it is a plain function over the same `callFn` the hooks use,
 * rather than a second copy of the request shape that could drift from them.
 */
export function attachStreamProduct(
  tokenId: string,
  listingId: string,
  wallet: string | null,
): Promise<unknown> {
  return callFn(
    "stream-products",
    { action: "attach", tokenId, listingId, livePrice: null },
    wallet,
  );
}

/**
 * Products attached to a stream, kept live over Supabase realtime.
 *
 * Realtime carries the raw row and not the joined listing, so a change
 * refetches instead of patching — the rail holds at most 20 rows.
 *
 * `enabled` exists because the Shop board on an ordinary feed card must not pay
 * for this. A feed is many cards, and an always-on call here is a Supabase
 * query and a realtime channel each, to answer a question the post's
 * `shopListingCount` already answers off the feed payload. The board passes its
 * open state, so both start on the tap that opens it.
 */
export function useStreamProducts(
  tokenId: string | number | null | undefined,
  enabled: boolean = true,
) {
  const queryClient = useQueryClient();
  const key = tokenId == null ? null : String(tokenId);
  // The overlay and the sheet both call this for the same stream. Two channels
  // sharing a topic name are not two subscriptions — removing one on unmount
  // takes the other's socket with it, and the survivor silently stops seeing
  // pins. A per-instance suffix keeps them independent.
  const channelId = useRef(Math.random().toString(36).slice(2));

  const query = useQuery({
    queryKey: ["stream-products", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stream_products")
        .select(
          "*, store_listings(id, title, description, price, images, category, is_digital, stock_quantity, status, wallet_address, shipping_info)",
        )
        .eq("token_id", key!)
        .order("is_pinned", { ascending: false })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as StreamProduct[];
    },
    enabled: !!key && enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!key || !enabled) return;
    const channel = supabase
      .channel(`stream-products-${key}-${channelId.current}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stream_products",
          filter: `token_id=eq.${key}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["stream-products", key] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [key, enabled, queryClient]);

  const products = query.data || [];
  // A rail that offers something unbuyable is worse than a shorter rail.
  const sellable = useMemo(
    () =>
      products.filter(
        (p) => p.store_listings?.status === "active" && p.store_listings?.stock_quantity !== 0,
      ),
    [products],
  );
  const pinned = useMemo(() => sellable.find((p) => p.is_pinned) || null, [sellable]);

  return { products, sellable, pinned, isLoading: query.isLoading, refetch: query.refetch };
}

/**
 * Host-side rail management.
 *
 * Every call is re-checked server-side against the token's minter — the wallet
 * this client sends is not signed, so gating the UI is convenience, not
 * security.
 */
export function useStreamProductActions(tokenId: string | number | null | undefined) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const key = tokenId == null ? null : String(tokenId);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["stream-products", key] });

  const attach = useMutation({
    mutationFn: (params: { listingId: string; livePrice?: number | null }) =>
      callFn(
        "stream-products",
        {
          action: "attach",
          tokenId: key,
          listingId: params.listingId,
          livePrice: params.livePrice ?? null,
        },
        wallet,
      ),
    onSuccess: () => {
      invalidate();
      toastSuccess("Added to the stream");
    },
    onError: (e: any) => toastError(e, "Could not add that item"),
  });

  const detach = useMutation({
    mutationFn: (listingId: string) =>
      callFn("stream-products", { action: "detach", tokenId: key, listingId }, wallet),
    onSuccess: invalidate,
    onError: (e: any) => toastError(e, "Could not remove that item"),
  });

  const pin = useMutation({
    mutationFn: (listingId: string) =>
      callFn("stream-products", { action: "pin", tokenId: key, listingId }, wallet),
    onSuccess: invalidate,
    onError: (e: any) => toastError(e, "Could not put that on air"),
  });

  const unpin = useMutation({
    mutationFn: () => callFn("stream-products", { action: "unpin", tokenId: key }, wallet),
    onSuccess: invalidate,
    onError: (e: any) => toastError(e, "Could not take that off air"),
  });

  return { attach, detach, pin, unpin };
}

/**
 * Buy a product from a stream: quote → pay → confirm.
 *
 * `sendTransfer` is injected rather than imported so this hook stays free of
 * the web3 stack; the sheet supplies it from useERC20Contract/writeContractAA.
 */
export function useLiveCheckout(
  tokenId: string | number | null | undefined,
  sendTransfer: (to: string, amountWholeTokens: number) => Promise<string>,
) {
  const wallet = useWallet();
  const queryClient = useQueryClient();
  const key = tokenId == null ? null : String(tokenId);

  const getQuote = useMutation({
    mutationFn: (listingId: string) =>
      callFn<LiveQuote>("live-checkout", { action: "quote", tokenId: key, listingId }, wallet),
  });

  const buy = useMutation({
    mutationFn: async (params: {
      quote: LiveQuote;
      shippingAddress?: string;
      notes?: string;
    }) => {
      const { quote, shippingAddress, notes } = params;

      if (quote.paymentsFrozen) {
        throw new Error(
          "DHB transfers are paused right now, so this purchase would fail. Try again once trading resumes.",
        );
      }

      const hash = await sendTransfer(quote.sellerAddress, quote.dhbAmount);
      if (!hash) throw new Error("Transaction was not submitted");

      // The receipt can lag the wallet's response, so a 202 means "ask again",
      // not "failed". The payment is already on-chain here — giving up would
      // strand a real transfer with no order behind it.
      let lastError = "Could not confirm the payment";
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          return await callFn<{ success: boolean; order: unknown; warning?: string }>(
            "live-checkout",
            {
              action: "confirm",
              tokenId: key,
              listingId: quote.listingId,
              txHash: hash,
              shippingAddress,
              notes,
            },
            wallet,
          );
        } catch (err) {
          lastError = (err as Error).message;
          if (!/not found yet/i.test(lastError)) throw err;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      log.error("confirm timed out", { hash });
      throw new Error(
        `${lastError}. Your payment went through — send this transaction to the seller: ${hash}`,
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stream-products", key] });
      queryClient.invalidateQueries({ queryKey: ["store-orders"] });
      toastSuccess(data.warning || "Order placed");
    },
    onError: (e: any) => {
      log.error("live purchase failed", e);
      toastError(e, "Purchase failed");
    },
  });

  return { getQuote, buy };
}
