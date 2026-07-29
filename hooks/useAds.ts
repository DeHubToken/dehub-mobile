/**
 * POVR ads data layer
 * ===================
 * Native port of web's use-ads.ts + lib/ads/povr.ts. Same Supabase tables
 * (`ad_accounts`, `ad_campaigns`, `ad_creatives`, `ad_daily_stats`,
 * `ad_payments`), same `x-wallet-address` RLS header, same `ads-topup` edge
 * function for crediting an on-chain DHB transfer.
 *
 * Tier CPMs mirror web's POVR_TIERS, which in turn mirror the edge copy in
 * supabase/functions/_shared/povr.ts — keep the three in step.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useAds");

// ── Domain types (mirror lib/ads/povr.ts) ───────────────────────────────────

export type CampaignObjective = "awareness" | "traffic" | "engagement";
export type CampaignStatus =
  | "draft" | "pending_review" | "active" | "paused"
  | "rejected" | "completed" | "archived";
export type CreativeKind = "image" | "video" | "text";
export type AdBehavior = "tippers" | "ppv_buyers" | "stakers" | "streamers";

export interface AdTargeting {
  tiers?: string[];
  followerMin?: number;
  followerMax?: number;
  languages?: string[];
  premium?: boolean;
  communities?: string[];
  behaviors?: AdBehavior[];
  categories?: string[];
  followedCreators?: string[];
}

export interface AdAccount {
  wallet_address: string;
  company_name: string | null;
  website: string | null;
  balance_usd: number;
  total_deposited_usd: number;
  total_spent_usd: number;
  status: "active" | "suspended";
  created_at: string;
  updated_at: string;
}

export interface AdCampaign {
  id: string;
  wallet_address: string;
  name: string;
  objective: CampaignObjective;
  status: CampaignStatus;
  review_note: string | null;
  approved_at: string | null;
  daily_budget_usd: number;
  total_budget_usd: number;
  spent_usd: number;
  start_at: string;
  end_at: string | null;
  targeting: AdTargeting;
  frequency_cap: number;
  cta_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdDailyStat {
  campaign_id: string;
  creative_id: string;
  day: string;
  impressions: number;
  clicks: number;
  spend_usd: number;
  viewer_share_usd: number;
  by_tier: Record<string, { impressions: number; clicks: number; spend: number }>;
}

export interface AdPayment {
  id: string;
  wallet_address: string;
  tx_hash: string;
  chain: "Base" | "BNB";
  dhb_amount: number;
  dhb_price_usd: number;
  usd_value: number;
  created_at: string;
}

export interface CampaignDraft {
  name: string;
  objective: string;
  daily_budget_usd: number;
  total_budget_usd: number;
  start_at?: string;
  end_at?: string | null;
  targeting: AdTargeting;
  frequency_cap?: number;
  cta_url?: string | null;
  status?: "draft" | "pending_review";
}

// ── Tiers / pricing (mirrors POVR_TIERS) ────────────────────────────────────

export interface PovrTierInfo { name: string; min: number; cpmUsd: number }

export const POVR_TIERS: PovrTierInfo[] = [
  { name: "Crab", min: 10_000, cpmUsd: 100 },
  { name: "Lobster", min: 25_000, cpmUsd: 180 },
  { name: "Piranha", min: 50_000, cpmUsd: 285 },
  { name: "Tortoise", min: 100_000, cpmUsd: 450 },
  { name: "Cobra", min: 250_000, cpmUsd: 800 },
  { name: "Octopus", min: 500_000, cpmUsd: 1_250 },
  { name: "Crocodite", min: 1_000_000, cpmUsd: 2_000 },
  { name: "Dolphin", min: 2_000_000, cpmUsd: 3_000 },
  { name: "Tiger Shark", min: 3_000_000, cpmUsd: 4_000 },
  { name: "Killer Whale", min: 5_000_000, cpmUsd: 5_500 },
  { name: "Great White Shark", min: 10_000_000, cpmUsd: 8_750 },
  { name: "Blue Whale", min: 25_000_000, cpmUsd: 16_000 },
  { name: "Meglodon", min: 50_000_000, cpmUsd: 25_000 },
];

export const NO_BADGE_TIER = { name: "none", label: "No Badge", cpmUsd: 10 };

export function tierLabel(name: string): string {
  return name === "none" ? NO_BADGE_TIER.label : name;
}

export function tierCpmUsd(name: string): number {
  if (name === "none") return NO_BADGE_TIER.cpmUsd;
  return POVR_TIERS.find((t) => t.name === name)?.cpmUsd ?? NO_BADGE_TIER.cpmUsd;
}

/** Blended CPM across a tier selection; empty selection = all tiers. */
export function blendedCpmUsd(tiers: string[]): number {
  const names = tiers.length ? tiers : ["none", ...POVR_TIERS.map((t) => t.name)];
  return names.reduce((s, n) => s + tierCpmUsd(n), 0) / names.length;
}

// ── Wallet helper ───────────────────────────────────────────────────────────

function useWallet(): string | null {
  const user = useUser() as any;
  const w = user?.walletAddress || user?.address;
  return w ? String(w).toLowerCase() : null;
}

const keys = {
  account: (w: string | null) => ["ads", "account", w] as const,
  campaigns: (w: string | null) => ["ads", "campaigns", w] as const,
  stats: (w: string | null, ids: string) => ["ads", "stats", w, ids] as const,
  payments: (w: string | null) => ["ads", "payments", w] as const,
};

// ── Account ─────────────────────────────────────────────────────────────────

export function useAdAccount() {
  const wallet = useWallet();
  return useQuery({
    queryKey: keys.account(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdAccount | null> => {
      const { data, error } = await withWalletHeader(
        supabase.from("ad_accounts").select("*").eq("wallet_address", wallet!).maybeSingle(),
        wallet,
      );
      if (error) throw error;
      return (data as AdAccount) ?? null;
    },
  });
}

export function useEnsureAdAccount() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fields?: { company_name?: string; website?: string }) => {
      if (!wallet) throw new Error("Connect a wallet first");
      // Insert-ignore first: a merge-duplicates upsert would try to UPDATE
      // wallet_address, which clients hold no column grant for.
      const { error: insErr } = await withWalletHeader(
        supabase
          .from("ad_accounts")
          .upsert({ wallet_address: wallet }, { onConflict: "wallet_address", ignoreDuplicates: true }),
        wallet,
      );
      if (insErr) throw insErr;
      if (fields && Object.keys(fields).length > 0) {
        const { error: updErr } = await withWalletHeader(
          supabase.from("ad_accounts").update(fields).eq("wallet_address", wallet),
          wallet,
        );
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.account(wallet) }),
    onError: (e: any) => {
      log.error("ensure ad account failed:", e);
      toastError(e, "Could not open an advertiser account");
    },
  });
}

// ── Campaigns ───────────────────────────────────────────────────────────────

export function useAdCampaigns() {
  const wallet = useWallet();
  return useQuery({
    queryKey: keys.campaigns(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdCampaign[]> => {
      const { data, error } = await withWalletHeader(
        supabase.from("ad_campaigns").select("*").order("created_at", { ascending: false }),
        wallet,
      );
      if (error) throw error;
      return (data as AdCampaign[]) ?? [];
    },
  });
}

export function useCreateCampaign() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: CampaignDraft): Promise<AdCampaign> => {
      if (!wallet) throw new Error("Connect a wallet first");
      const { data, error } = await withWalletHeader(
        supabase
          .from("ad_campaigns")
          .insert({ ...draft, wallet_address: wallet })
          .select("*")
          .single(),
        wallet,
      );
      if (error) throw error;
      return data as AdCampaign;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.campaigns(wallet) });
      toastSuccess("Campaign created");
    },
    onError: (e: any) => {
      log.error("create campaign failed:", e);
      toastError(e, "Could not create campaign");
    },
  });
}

export function useUpdateCampaign() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; [k: string]: any }) => {
      const { error } = await withWalletHeader(
        supabase.from("ad_campaigns").update(patch).eq("id", id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns(wallet) }),
    onError: (e: any) => {
      log.error("update campaign failed:", e);
      toastError(e, "Could not update campaign");
    },
  });
}

export function useDeleteCampaign() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await withWalletHeader(
        supabase.from("ad_campaigns").delete().eq("id", id),
        wallet,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.campaigns(wallet) });
      toastSuccess("Campaign deleted");
    },
    onError: (e: any) => {
      log.error("delete campaign failed:", e);
      toastError(e, "Could not delete campaign");
    },
  });
}

// ── Stats ───────────────────────────────────────────────────────────────────

export function useAllCampaignStats(campaignIds: string[]) {
  const wallet = useWallet();
  return useQuery({
    queryKey: keys.stats(wallet, campaignIds.join(",")),
    enabled: !!wallet && campaignIds.length > 0,
    queryFn: async (): Promise<AdDailyStat[]> => {
      const { data, error } = await withWalletHeader(
        supabase.from("ad_daily_stats").select("*").in("campaign_id", campaignIds).order("day"),
        wallet,
      );
      if (error) throw error;
      return (data as AdDailyStat[]) ?? [];
    },
  });
}

/** Cross-campaign KPI rollup — same maths as web's AdsOverviewTab. */
export function rollupStats(stats: AdDailyStat[] | undefined) {
  let impressions = 0;
  let clicks = 0;
  let spend = 0;
  for (const s of stats ?? []) {
    impressions += s.impressions;
    clicks += s.clicks;
    spend += Number(s.spend_usd);
  }
  return {
    impressions,
    clicks,
    spend,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    ecpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
  };
}

/** Daily series for the performance chart, ascending by day. */
export function statsByDay(stats: AdDailyStat[] | undefined) {
  const byDay = new Map<string, { day: string; impressions: number; clicks: number }>();
  for (const s of stats ?? []) {
    const e = byDay.get(s.day);
    if (e) {
      e.impressions += s.impressions;
      e.clicks += s.clicks;
    } else {
      byDay.set(s.day, { day: s.day, impressions: s.impressions, clicks: s.clicks });
    }
  }
  return Array.from(byDay.values()).sort((a, b) => a.day.localeCompare(b.day));
}

// ── Payments / top-up ───────────────────────────────────────────────────────

export function useAdPayments() {
  const wallet = useWallet();
  return useQuery({
    queryKey: keys.payments(wallet),
    enabled: !!wallet,
    queryFn: async (): Promise<AdPayment[]> => {
      const { data, error } = await withWalletHeader(
        supabase.from("ad_payments").select("*").order("created_at", { ascending: false }).limit(50),
        wallet,
      );
      if (error) throw error;
      return (data as AdPayment[]) ?? [];
    },
  });
}

/**
 * Verify an on-chain DHB transfer and credit the ad account. The tx itself is
 * sent by the caller (see AdsScreen, which reuses the same AA-aware transfer
 * path as the Stores checkout); this only asks the edge function to confirm it.
 */
export function useTopUpCredit() {
  const wallet = useWallet();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (txHash: string) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const { data, error } = await supabase.functions.invoke("ads-topup", {
        body: { txHash },
        headers: { "x-wallet-address": wallet },
      });
      if (error) {
        // Surface the function's JSON error body when present.
        const ctx = (error as any)?.context;
        let msg = error.message;
        try {
          const parsed = typeof ctx?.body === "string" ? JSON.parse(ctx.body) : null;
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* keep the original message */
        }
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.account(wallet) });
      qc.invalidateQueries({ queryKey: keys.payments(wallet) });
      toastSuccess("Credit added");
    },
    onError: (e: any) => {
      log.error("top-up failed:", e);
      toastError(e, "Top-up could not be verified");
    },
  });
}
