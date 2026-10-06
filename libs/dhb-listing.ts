/**
 * $DHB listing-soon
 * =================
 * $DHB is not trading yet, so DexScreener has nothing for it and the ticker
 * sheet used to say "No data found for $DHB". Every DHB card in the app (feed
 * ticker cards, $DHB taps in captions, Top 100) opens that sheet, so the sheet
 * shows "Token listing soon!" with a "Notify me" signup instead.
 *
 * Signups go through the `join_token_listing_waitlist` RPC, the same list the
 * web card writes to (dehubweb: supabase/migrations/
 * 20261006180000_token_listing_waitlist.sql). The app can write to the list but
 * never read it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../services/supabase";
import { getSupabaseAuthMeta } from "../services/auth/supabaseAuth.service";

export function isDhbListingSymbol(symbol: string): boolean {
  const s = symbol.trim().replace(/^\$/, "").toUpperCase();
  return s === "DHB" || s === "DEHUB";
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidListingEmail(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && EMAIL_RE.test(e) && !e.toLowerCase().endsWith(".dehub.internal");
}

/**
 * The email the person signs in with, when it is a real address. Phone and
 * Telegram accounts carry a synthetic `*.dehub.internal` address and wallet
 * accounts carry none; both come back null so the sheet asks.
 */
export async function getSignInEmail(): Promise<string | null> {
  const email = (await getSupabaseAuthMeta())?.email;
  return typeof email === "string" && isValidListingEmail(email) ? email.trim() : null;
}

export interface ListingSignup {
  email: string;
  walletAddress?: string | null;
  username?: string | null;
}

export async function joinDhbListingWaitlist(signup: ListingSignup): Promise<{ alreadyJoined: boolean }> {
  const { data, error } = await supabase.rpc("join_token_listing_waitlist" as never, {
    p_token: "DHB",
    p_email: signup.email.trim(),
    p_wallet_address: signup.walletAddress ?? null,
    p_username: signup.username ?? null,
    p_source: "mobile",
  } as never);
  if (error) throw error;
  const result = (data ?? {}) as { alreadyJoined?: boolean };
  return { alreadyJoined: result.alreadyJoined === true };
}

const JOINED_KEY = "dhb-listing-notify:v1";

/** The address this phone signed up with, so reopening the sheet shows "on the list". */
export async function readJoinedEmail(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(JOINED_KEY);
  } catch {
    return null;
  }
}

export async function rememberJoinedEmail(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(JOINED_KEY, email.trim().toLowerCase());
  } catch {
    /* storage unavailable: the signup itself already landed */
  }
}
