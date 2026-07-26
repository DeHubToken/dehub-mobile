// DeHub affiliate / invite sharing for mobile.
//
// Mirrors the web app's `getOrCreateAffiliateCode` (cosmic-echo-hero/src/lib/affiliate.ts):
// each wallet owns a stable code in the shared Supabase `affiliate_codes` table.
// Sharing `${APP_ORIGIN}/r/{code}` lets the web SSR edge function unfurl the
// affiliate share image and attribute referrals (first-touch wins, 90-day cookie).

import { supabase } from "../services/supabase";
import env from "../config/env";
import { shareProfile } from "./misc";
import { withWalletHeader } from "./supabase-wallet-client";

export const AFFILIATE_COMMISSION_PCT = 20;
/** Direct (tier 1) commission — you invited them. */
export const AFFILIATE_L1_COMMISSION_PCT = 20;
/** Secondary (tier 2) commission — your invites invited them. */
export const AFFILIATE_L2_COMMISSION_PCT = 5;

const randomCode = (len = 8) => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

export async function getOrCreateAffiliateCode(
  ownerAddress: string,
  shareName?: string | null,
): Promise<{ code: string; share_name: string | null } | null> {
  const addr = ownerAddress.toLowerCase();
  const cleanShareName = shareName?.trim().replace(/^@+/, "").slice(0, 32) || null;

  // @ts-ignore - affiliate_codes not in generated Database types
  const { data: existing } = await supabase
    .from("affiliate_codes" as never)
    .select("code,share_name")
    .ilike("owner_address", addr)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1) as unknown as { data: Array<{ code: string; share_name: string | null }> | null };

  if (existing && existing.length > 0) {
    const current = existing[0];
    // Keep the stored share name in step with the profile display name, so the
    // /r/{code} share image renders the current name (matches web).
    if (cleanShareName && current.share_name !== cleanShareName) {
      const { data } = await withWalletHeader(
        // @ts-ignore
        supabase
          .from("affiliate_codes" as never)
          .update({ share_name: cleanShareName } as never)
          .ilike("owner_address", addr)
          .eq("code", current.code)
          .select("code,share_name")
          .maybeSingle(),
        addr,
      ) as unknown as { data: { code: string; share_name: string | null } | null };
      if (data) return data;
    }
    return current;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const { data, error } = await withWalletHeader(
      // @ts-ignore
      supabase
        .from("affiliate_codes" as never)
        .insert({
          code,
          owner_address: addr,
          share_name: cleanShareName,
          commission_pct: AFFILIATE_COMMISSION_PCT,
        } as never)
        .select("code,share_name")
        .maybeSingle(),
      addr,
    ) as unknown as { data: { code: string; share_name: string | null } | null; error: { message?: string } | null };
    if (!error && data) return data;
  }
  return null;
}

export function buildInviteLink(code: string): string {
  const origin = (env.APP_ORIGIN || "https://dehub.io").replace(/\/+$/, "");
  return `${origin}/r/${code}`;
}

export function buildInviteMessage(code: string, link: string): string {
  return `Use invite code ${code} to join DeHub — the decentralised creator network for video, music, social, jobs and Web3.\n\n${link}`;
}

// Per-wallet in-memory cache so repeat taps don't re-hit Supabase.
let _cache: { addr: string; code: string } | null = null;

export async function resolveInviteCode(
  ownerAddress: string,
  shareName?: string | null,
): Promise<string | null> {
  const addr = (ownerAddress || "").toLowerCase();
  if (!addr) return null;
  if (_cache && _cache.addr === addr) return _cache.code;
  const res = await getOrCreateAffiliateCode(addr, shareName);
  const code = res?.code ?? null;
  if (code) _cache = { addr, code };
  return code;
}

// ── Stats ───────────────────────────────────────────────────────────────────
// Ported from the web app's lib/affiliate.ts so both clients read the same
// Supabase tables (affiliate_referrals / affiliate_earnings) with identical
// tier maths.

/** A single account you referred — the "who", not just the count. */
export type AffiliateReferralEntry = {
  /** referred wallet address */
  address: string;
  /** when they were attributed to you */
  createdAt: string | null;
  /** the invite code they came through */
  code: string | null;
};

export type AffiliateStats = {
  code: string | null;
  shareName: string | null;
  /** L1 — directly invited */
  referrals: number;
  /** L2 — invited by your L1s */
  l2Referrals: number;
  l1List: AffiliateReferralEntry[];
  l2List: AffiliateReferralEntry[];
  totalEarnedCents: number;
  l1EarnedCents: number;
  l2EarnedCents: number;
  currency: string;
};

// Most-recent referrals returned for the "who" list. The exact total still
// comes from the query's count, so the counter stays accurate past this cap.
const REFERRAL_LIST_CAP = 500;

type ReferralRow = { referred_address: string | null; created_at: string | null; code: string | null };

function mapReferralRows(rows: ReferralRow[] | null): AffiliateReferralEntry[] {
  return (rows ?? [])
    .filter((r): r is ReferralRow & { referred_address: string } => !!r.referred_address)
    .map((r) => ({
      address: r.referred_address.toLowerCase(),
      createdAt: r.created_at ?? null,
      code: r.code ?? null,
    }));
}

export async function loadAffiliateStats(
  ownerAddress: string,
  shareName?: string | null,
): Promise<AffiliateStats> {
  const addr = ownerAddress.toLowerCase();

  // All four queries only depend on the address — run them in parallel.
  // The referral queries select the rows with an exact count, so a single
  // round-trip yields both the "who" list and the counter total.
  const [codeRes, refRes, l2RefRes, earnRes] = await Promise.all([
    getOrCreateAffiliateCode(addr, shareName),
    // @ts-ignore - affiliate_referrals not in generated Database types
    supabase
      .from("affiliate_referrals" as never)
      .select("referred_address,created_at,code", { count: "exact" })
      .ilike("owner_address", addr)
      .order("created_at", { ascending: false })
      .limit(REFERRAL_LIST_CAP) as unknown as Promise<{ data: ReferralRow[] | null; count: number | null }>,
    // @ts-ignore
    supabase
      .from("affiliate_referrals" as never)
      .select("referred_address,created_at,code", { count: "exact" })
      .ilike("l2_owner_address", addr)
      .order("created_at", { ascending: false })
      .limit(REFERRAL_LIST_CAP) as unknown as Promise<{ data: ReferralRow[] | null; count: number | null }>,
    withWalletHeader(
      // @ts-ignore
      supabase
        .from("affiliate_earnings" as never)
        .select("commission_cents,currency,tier"),
      addr,
    ) as unknown as Promise<{ data: Array<{ commission_cents: number; currency: string; tier: number }> | null }>,
  ]);

  const l1List = mapReferralRows(refRes.data);
  const l2List = mapReferralRows(l2RefRes.data);

  const rows = earnRes.data ?? [];
  const l1EarnedCents = rows.filter((r) => r.tier !== 2).reduce((s, r) => s + (r.commission_cents ?? 0), 0);
  const l2EarnedCents = rows.filter((r) => r.tier === 2).reduce((s, r) => s + (r.commission_cents ?? 0), 0);

  return {
    code: codeRes?.code ?? null,
    shareName: codeRes?.share_name ?? null,
    // Prefer the exact server count; fall back to the fetched rows so a missing
    // count header never silently collapses the counter to zero.
    referrals: refRes.count ?? l1List.length,
    l2Referrals: l2RefRes.count ?? l2List.length,
    l1List,
    l2List,
    totalEarnedCents: l1EarnedCents + l2EarnedCents,
    l1EarnedCents,
    l2EarnedCents,
    currency: (rows[0]?.currency || "usd").toUpperCase(),
  };
}

/** Resolve the wallet's invite code and open the native share sheet. Returns false if unavailable. */
export async function shareInvite(ownerAddress: string, shareName?: string | null): Promise<boolean> {
  const code = await resolveInviteCode(ownerAddress, shareName);
  if (!code) return false;
  const link = buildInviteLink(code);
  await shareProfile(link, buildInviteMessage(code, link));
  return true;
}
