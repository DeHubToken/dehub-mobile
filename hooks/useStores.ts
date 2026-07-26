/**
 * Stores data layer
 * =================
 * Native port of the web app's use-stores.ts + use-store-reviews.ts. Same
 * Supabase tables (`stores`, `store_listings`, `store_orders`, `store_reviews`)
 * and the same RLS wallet header, so both clients see the same marketplace.
 *
 * Seller tooling (create store / create listing / fulfil orders) is not ported
 * yet — it needs the image-upload pipeline. Buying, browsing and reviewing are
 * complete.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import env from "../config/env";

const log = createLogger("useStores");

export const STORE_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "digital", label: "Digital" },
  { value: "merch", label: "Merch" },
  { value: "art", label: "Art" },
  { value: "service", label: "Services" },
  { value: "other", label: "Other" },
] as const;

export const STORE_SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price ↑" },
  { value: "price_desc", label: "Price ↓" },
] as const;

export interface Store {
  id: string;
  wallet_address: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  created_at: string;
}

export interface StoreListing {
  id: string;
  store_id: string;
  wallet_address: string;
  title: string;
  description: string | null;
  price: number;
  category: string;
  images: string[] | null;
  stock_quantity: number | null;
  is_digital: boolean;
  condition: string | null;
  shipping_info: string | null;
  status: string;
  created_at: string;
  stores?: { name: string; avatar_url: string | null; wallet_address: string } | null;
}

export interface StoreOrder {
  id: string;
  listing_id: string;
  buyer_address: string;
  seller_address: string;
  amount: number;
  tx_hash: string;
  status: string;
  shipping_address: string | null;
  notes: string | null;
  created_at: string;
  store_listings?: { title: string; images: string[] | null; price: number } | null;
}

export interface StoreReview {
  id: string;
  listing_id: string;
  reviewer_address: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

function useWallet(): string | null {
  const user = useUser() as any;
  return (user?.walletAddress || user?.address || null) as string | null;
}

// ── Prices ──────────────────────────────────────────────────────────────────

/**
 * USD prices keyed by symbol, from the same `get-dhb-price` edge function the
 * web wallet uses. Listings are priced in USD and settled in DHB.
 */
export function useTokenPrices() {
  return useQuery({
    queryKey: ["token-prices"],
    queryFn: async () => {
      const res = await fetch(`${env.SUPABASE_URL}/functions/v1/get-dhb-price`, {
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
      });
      if (!res.ok) throw new Error("Failed to fetch prices");
      const data = await res.json();
      return (data?.prices ?? {}) as Record<string, number>;
    },
    staleTime: 60_000,
  });
}

// ── Media upload ────────────────────────────────────────────────────────────

/**
 * Upload a picked local image to the shared `store-media` bucket and return its
 * public URL. Web uploads a `File`; React Native has no File, so the local URI
 * is read into a Blob first — the same approach communities.service.ts uses.
 * Path shape matches web's CreateListingDrawer.
 */
export async function uploadStoreMedia(
  localUri: string,
  folder: "listings" | "stores" = "listings",
): Promise<string> {
  const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const response = await fetch(localUri);
  const blob = await response.blob();
  const { error } = await supabase.storage
    .from("store-media")
    .upload(path, blob, { upsert: true, contentType: blob.type || "image/jpeg" });
  if (error) throw error;
  const { data } = supabase.storage.from("store-media").getPublicUrl(path);
  return data.publicUrl;
}

// ── My stores (seller) ──────────────────────────────────────────────────────

export function useMyStores() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["my-stores", wallet],
    queryFn: async () => {
      const addr = wallet!.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("stores")
          .select("*")
          .eq("wallet_address", addr)
          .order("created_at", { ascending: true }),
        addr,
      );
      if (error) throw error;
      return (data || []) as Store[];
    },
    enabled: !!wallet,
  });
}

export function useCreateStore() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      avatar_url?: string;
      banner_url?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("stores")
          .insert({
            wallet_address: addr,
            name: params.name,
            description: params.description || "",
            avatar_url: params.avatar_url || null,
            banner_url: params.banner_url || null,
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data as Store;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-stores"] });
      toastSuccess("Store created!");
    },
    onError: (e: any) => {
      log.error("Create store failed:", e);
      toastError(e, "Failed to create store");
    },
  });
}

export function useUpdateStore() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      name?: string;
      description?: string;
      avatar_url?: string;
      banner_url?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from("stores").update(updates).eq("id", id),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-stores"] });
      qc.invalidateQueries({ queryKey: ["store"] });
      toastSuccess("Store updated!");
    },
    onError: (e: any) => {
      log.error("Update store failed:", e);
      toastError(e, "Failed to update store");
    },
  });
}

export function useMyListings() {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["my-store-listings", wallet],
    queryFn: async () => {
      const addr = wallet!.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("store_listings")
          .select("*")
          .eq("wallet_address", addr)
          .order("created_at", { ascending: false }),
        addr,
      );
      if (error) throw error;
      return (data || []) as StoreListing[];
    },
    enabled: !!wallet,
  });
}

export function useCreateListing() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      title: string;
      description?: string;
      price: number;
      category: string;
      images: string[];
      stock_quantity?: number | null;
      is_digital: boolean;
      condition: string;
      shipping_info?: string;
      status?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("store_listings")
          .insert({ ...params, wallet_address: addr, images: params.images })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data as StoreListing;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-store-listings"] });
      qc.invalidateQueries({ queryKey: ["store-listings-browse"] });
      toastSuccess("Listing created!");
    },
    onError: (e: any) => {
      log.error("Create listing failed:", e);
      toastError(e, "Failed to create listing");
    },
  });
}

export function useUpdateListing() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from("store_listings").update(updates).eq("id", id),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-store-listings"] });
      qc.invalidateQueries({ queryKey: ["store-listings-browse"] });
    },
  });
}

export function useUpdateOrderStatus() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { error } = await withWalletHeader(
        supabase.from("store_orders").update({ status }).eq("id", id),
        addr,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-orders"] });
    },
  });
}

// ── Browse ──────────────────────────────────────────────────────────────────

export function useBrowseListings(category?: string, sort?: string, search?: string) {
  return useQuery({
    queryKey: ["store-listings-browse", category, sort, search],
    queryFn: async () => {
      let q = supabase
        .from("store_listings")
        .select("*, stores(name, avatar_url, wallet_address)")
        .eq("status", "active");

      if (category && category !== "all") q = q.eq("category", category);
      if (search) q = q.ilike("title", `%${search}%`);

      if (sort === "price_asc") q = q.order("price", { ascending: true });
      else if (sort === "price_desc") q = q.order("price", { ascending: false });
      else q = q.order("created_at", { ascending: false });

      const { data, error } = await q.limit(50);
      if (error) throw error;
      return (data || []) as StoreListing[];
    },
    // Keep the previous grid visible while new filters load, as on web.
    placeholderData: keepPreviousData,
  });
}

export function useStoreById(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return data as Store | null;
    },
    enabled: !!storeId,
  });
}

/**
 * A single listing. `seed` is the row the browse grid already holds — the
 * select shape is identical, so the detail screen paints instantly.
 */
export function useStoreListing(listingId: string | undefined, seed?: StoreListing) {
  return useQuery({
    queryKey: ["store-listing", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_listings")
        .select("*, stores(name, avatar_url, wallet_address)")
        .eq("id", listingId!)
        .maybeSingle();
      if (error) throw error;
      return data as StoreListing | null;
    },
    enabled: !!listingId,
    placeholderData: seed,
  });
}

export function useStoreListings(storeId: string | undefined) {
  return useQuery({
    queryKey: ["store-listings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_listings")
        .select("*, stores(name, avatar_url, wallet_address)")
        .eq("store_id", storeId!)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StoreListing[];
    },
    enabled: !!storeId,
  });
}

// ── Orders ──────────────────────────────────────────────────────────────────

export function useMyOrders(type: "buyer" | "seller") {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["store-orders", type, wallet],
    queryFn: async () => {
      const addr = wallet!.toLowerCase();
      let q = supabase
        .from("store_orders")
        .select("*, store_listings(title, images, price)");
      q = type === "buyer" ? q.eq("buyer_address", addr) : q.eq("seller_address", addr);
      const { data, error } = await withWalletHeader(
        q.order("created_at", { ascending: false }),
        addr,
      );
      if (error) throw error;
      return (data || []) as StoreOrder[];
    },
    enabled: !!wallet,
  });
}

export function useCreateOrder() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      listing_id: string;
      seller_address: string;
      amount: number;
      tx_hash: string;
      shipping_address?: string;
      notes?: string;
    }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("store_orders")
          .insert({ ...params, buyer_address: addr })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["store-orders"] });
      qc.invalidateQueries({ queryKey: ["store-listings-browse"] });
      toastSuccess("Order placed successfully!");
    },
    onError: (e: any) => {
      log.error("Create order failed:", e);
      toastError(e, "Failed to record order");
    },
  });
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export function useListingReviews(listingId: string | undefined) {
  return useQuery({
    queryKey: ["store-reviews", listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_reviews")
        .select("*")
        .eq("listing_id", listingId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as StoreReview[];
    },
    enabled: !!listingId,
  });
}

/** Reviews are gated on having actually bought the item, same as web. */
export function useHasPurchased(listingId: string | undefined) {
  const wallet = useWallet();
  return useQuery({
    queryKey: ["has-purchased", listingId, wallet],
    queryFn: async () => {
      const addr = wallet!.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("store_orders")
          .select("id")
          .eq("listing_id", listingId!)
          .eq("buyer_address", addr)
          .limit(1),
        addr,
      );
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!listingId && !!wallet,
  });
}

export function useCreateReview() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { listing_id: string; rating: number; comment?: string }) => {
      if (!wallet) throw new Error("Not authenticated");
      const addr = wallet.toLowerCase();
      const { data, error } = await withWalletHeader(
        supabase
          .from("store_reviews")
          .insert({
            listing_id: params.listing_id,
            reviewer_address: addr,
            rating: params.rating,
            comment: params.comment || "",
          })
          .select()
          .single(),
        addr,
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["store-reviews", vars.listing_id] });
      toastSuccess("Review submitted!");
    },
    onError: (e: any) => {
      log.error("Create review failed:", e);
      toastError(e, "Failed to submit review");
    },
  });
}

export function averageRating(reviews: StoreReview[] | undefined): { avg: number; count: number } {
  if (!reviews || reviews.length === 0) return { avg: 0, count: 0 };
  return {
    avg: reviews.reduce((s, r) => s + r.rating, 0) / reviews.length,
    count: reviews.length,
  };
}
