/**
 * Launchpad service
 * =================
 * Reads and writes the Supabase `launchpad_tokens` / `launchpad_trades` tables
 * and calls the `launchpad-mock-trade` edge function, mirroring the web app's
 * use-launchpad-tokens / use-launchpad-trades hooks.
 *
 * Phase 1 is a mock: a trade is a row the edge function prices on the bonding
 * curve, not an on-chain transaction. Creating and trading are still token
 * actions as far as the stores are concerned, so the screens gate both behind
 * DIGITAL_PURCHASES_ENABLED.
 */
import { supabase } from "./supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { uploadLocalFileToBucket, fileExtension, contentTypeForExtension } from "../libs/storage-upload";

export type LaunchpadStatus = "bonding" | "graduating" | "graduated";
export type LaunchpadCurve = "standard" | "fair" | "stealth";
export type LaunchpadFilter = "new" | "graduating" | "trending" | "graduated" | "mine";

export interface LaunchpadToken {
  id: string;
  chain_id: number;
  creator_address: string;
  name: string;
  symbol: string;
  image_url: string | null;
  description: string | null;
  socials: Record<string, string>;
  status: LaunchpadStatus;
  supply_sold: number;
  market_cap_usd: number;
  volume_24h: number;
  progress_bps: number;
  graduation_target_usd: number;
  curve_type?: LaunchpadCurve;
  created_at: string;
  updated_at: string;
}

export interface LaunchpadTrade {
  id: string;
  token_id: string;
  trader_address: string;
  side: "buy" | "sell";
  dhb_in: number;
  tokens_out: number;
  price_per_token: number;
  created_at: string;
}

export const LAUNCHPAD_CHAINS: readonly { id: 8453 | 56; label: string }[] = [
  { id: 8453, label: "Base" },
  { id: 56, label: "BNB" },
];

export const chainLabel = (chainId: number) => (chainId === 8453 ? "Base" : "BNB");

export async function listLaunchpadTokens(
  filter: LaunchpadFilter,
  mineAddress?: string | null,
): Promise<LaunchpadToken[]> {
  let q = supabase.from("launchpad_tokens").select("*").limit(100);
  if (filter === "new") q = q.order("created_at", { ascending: false });
  else if (filter === "graduating") q = q.eq("status", "bonding").order("progress_bps", { ascending: false });
  else if (filter === "trending") q = q.order("volume_24h", { ascending: false });
  else if (filter === "graduated") q = q.eq("status", "graduated").order("updated_at", { ascending: false });
  else if (filter === "mine") {
    if (!mineAddress) return [];
    q = q.eq("creator_address", mineAddress.toLowerCase()).order("created_at", { ascending: false });
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as LaunchpadToken[];
}

/** The trending strip: top 20 by 24h volume. */
export async function listTrendingLaunchpadTokens(): Promise<LaunchpadToken[]> {
  const { data, error } = await supabase
    .from("launchpad_tokens")
    .select("*")
    .order("volume_24h", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as unknown as LaunchpadToken[];
}

/** One coin, or null when the id matches nothing. */
export async function getLaunchpadToken(id: string): Promise<LaunchpadToken | null> {
  const { data, error } = await supabase.from("launchpad_tokens").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as unknown as LaunchpadToken) ?? null;
}

export async function listLaunchpadTrades(tokenId?: string, limit = 50): Promise<LaunchpadTrade[]> {
  let q = supabase.from("launchpad_trades").select("*").order("created_at", { ascending: false }).limit(limit);
  if (tokenId) q = q.eq("token_id", tokenId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as LaunchpadTrade[];
}

export async function mockLaunchpadTrade(args: {
  tokenId: string;
  side: "buy" | "sell";
  amount: number;
  traderAddress: string;
}): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("launchpad-mock-trade", {
    body: {
      token_id: args.tokenId,
      side: args.side,
      amount: args.amount,
      trader_address: args.traderAddress,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data;
}

export interface CreateLaunchpadTokenInput {
  walletAddress: string;
  chainId: 8453 | 56;
  name: string;
  symbol: string;
  description: string;
  imageUrl: string;
  website: string;
  twitter: string;
  telegram: string;
  curveType: LaunchpadCurve;
}

export async function createLaunchpadToken(input: CreateLaunchpadTokenInput): Promise<LaunchpadToken> {
  const { data, error } = await withWalletHeader(
    supabase
      .from("launchpad_tokens")
      .insert({
        chain_id: input.chainId,
        creator_address: input.walletAddress.toLowerCase(),
        name: input.name.trim(),
        symbol: input.symbol.trim().toUpperCase(),
        description: input.description.trim() || null,
        image_url: input.imageUrl.trim() || null,
        socials: { website: input.website, twitter: input.twitter, telegram: input.telegram },
        curve_type: input.curveType,
      } as any)
      .select()
      .single(),
    input.walletAddress,
  );
  if (error) throw error;
  return data as unknown as LaunchpadToken;
}

/** Upload a picked image to the same bucket and path shape web uses. */
export async function uploadLaunchpadImage(
  walletAddress: string | null | undefined,
  file: { uri: string; fileName?: string | null; mimeType?: string | null },
): Promise<string> {
  const ext = fileExtension(file, "png");
  const path = `launchpad/${(walletAddress || "anon").toLowerCase()}/${Date.now()}.${ext}`;
  return uploadLocalFileToBucket({
    bucket: "ai-media-uploads",
    path,
    uri: file.uri,
    contentType: contentTypeForExtension(ext, "image/png"),
  });
}
