// DeHub affiliate / invite sharing for mobile.
//
// Mirrors the web app's `getOrCreateAffiliateCode` (cosmic-echo-hero/src/lib/affiliate.ts):
// each wallet owns a stable code in the shared Supabase `affiliate_codes` table.
// Sharing `${APP_ORIGIN}/r/{code}` lets the web SSR edge function unfurl the
// affiliate share image and attribute referrals (first-touch wins, 90-day cookie).

import { supabase } from "../services/supabase";
import env from "../config/env";
import { shareProfile } from "./misc";

export const AFFILIATE_COMMISSION_PCT = 20;

/** Attach the wallet address header used by Supabase RLS policies (same as web). */
function withWalletHeader<T extends { setHeader?: (k: string, v: string) => T }>(
  query: T,
  walletAddress: string | null,
): T {
  if (!walletAddress) return query;
  if (query && typeof query.setHeader === "function") {
    return query.setHeader("x-wallet-address", walletAddress.toLowerCase());
  }
  return query;
}

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

  if (existing && existing.length > 0) return existing[0];

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

/** Resolve the wallet's invite code and open the native share sheet. Returns false if unavailable. */
export async function shareInvite(ownerAddress: string, shareName?: string | null): Promise<boolean> {
  const code = await resolveInviteCode(ownerAddress, shareName);
  if (!code) return false;
  const link = buildInviteLink(code);
  await shareProfile(link, buildInviteMessage(code, link));
  return true;
}
