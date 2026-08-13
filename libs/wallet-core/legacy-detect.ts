// Legacy-account detection — mobile port of dehubweb's
// src/lib/wallet-core/legacy-detect.ts. Calls the SAME already-deployed
// Supabase edge function (legacy-account-check), so no backend change is
// needed to use this from mobile.
//
// Without this check, a Supabase identity with a pre-migration Web3Auth
// account silently gets a brand-new, empty wallet the moment it reaches
// "needs-create-password" — the exact bug that orphaned real accounts
// (with followers/uploads/DHB balance) behind throwaway ones. Mobile has no
// Web3Auth SDK to reconstruct the OLD key itself (that migration path is
// web-only — see dehubweb's lib/legacy-web3auth.ts), so this can only WARN
// and point the user to web, not self-serve the recovery. That's still a
// large improvement over silently minting a duplicate with no warning at all.
import { supabase } from "../../services/supabase";

/**
 * Phone sign-ups get a synthetic address of this form so GoTrue has something
 * to key a password grant on (see cosmic-echo-hero's verify-phone-otp, and
 * getSupabaseAuthMeta in services/auth/supabaseAuth.service.ts). It is never a
 * real inbox, so it can never match a pre-migration account.
 */
const SYNTHETIC_PHONE_EMAIL_SUFFIX = "@phone.dehub.internal";

/** One pre-migration account found for the checked email. */
export interface LegacyAccountMatch {
  signupMethod?: string;
  ethAddress: string;
  username?: string;
  badgeBalance?: number;
}

export interface LegacyAccountHint {
  /** true = old account(s) found; false = none for this email; null = unknown (check unavailable). */
  exists: boolean | null;
  accounts?: LegacyAccountMatch[];
  email?: string;
}

/**
 * Memoized per Supabase identity for the app session. A single sign-in asks
 * this question from two places (provisionAndSignIn's pre-exchange check and
 * routeToWalletUi's pre-create check), and the answer cannot change between
 * them — it is keyed on an email that is already verified and fixed by the
 * time either runs. Without this the edge function is invoked twice, and its
 * cold start is one of the largest single stalls in a first-time sign-in.
 *
 * Keyed by user id rather than a bare flag so switching identities in one app
 * session re-asks, instead of answering for whoever signed in first.
 */
let cachedHint: { userId: string; hint: LegacyAccountHint } | null = null;

/**
 * Ask the backend whether the current session's verified email has a
 * pre-migration account. Never throws; unknown → { exists: null } so the
 * caller can fall back to letting wallet creation proceed rather than
 * blocking a genuinely-new user on an unavailable check.
 */
export async function checkLegacyAccount(): Promise<LegacyAccountHint> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionUser = sessionData?.session?.user;
    const userId = sessionUser?.id;

    if (userId && cachedHint?.userId === userId) return cachedHint.hint;

    // Pre-migration accounts are matched by verified email. A phone sign-up
    // has no real one — only the synthetic @phone.dehub.internal address — so
    // the function can only ever answer "none", and invoking it just adds a
    // cold-start-sized stall to every phone sign-up. Note this deliberately
    // does NOT skip on a merely-absent email: that is the "unknown" case,
    // which must still ask rather than assume.
    const email = sessionUser?.email;
    if (email && email.endsWith(SYNTHETIC_PHONE_EMAIL_SUFFIX)) {
      const hint: LegacyAccountHint = { exists: false, accounts: [] };
      if (userId) cachedHint = { userId, hint };
      return hint;
    }

    const { data, error } = await supabase.functions.invoke("legacy-account-check");
    // An unavailable check is NOT cached: "unknown" is a transient condition,
    // and remembering it would keep a recoverable account hidden for the rest
    // of the session.
    if (error || !data || typeof data.exists !== "boolean") return { exists: null };
    const accounts: LegacyAccountMatch[] = Array.isArray(data.accounts)
      ? data.accounts
          .filter((a: unknown) => !!a && typeof (a as any).ethAddress === "string")
          .map((a: any) => ({
            signupMethod: typeof a.signupMethod === "string" ? a.signupMethod : undefined,
            ethAddress: a.ethAddress,
            username: typeof a.username === "string" ? a.username : undefined,
            badgeBalance: typeof a.badgeBalance === "number" ? a.badgeBalance : undefined,
          }))
      : [];
    const hint: LegacyAccountHint = {
      exists: data.exists,
      accounts,
      email: typeof data.email === "string" ? data.email : undefined,
    };
    if (userId) cachedHint = { userId, hint };
    return hint;
  } catch {
    return { exists: null };
  }
}
