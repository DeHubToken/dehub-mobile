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
 * Ask the backend whether the current session's verified email has a
 * pre-migration account. Never throws; unknown → { exists: null } so the
 * caller can fall back to letting wallet creation proceed rather than
 * blocking a genuinely-new user on an unavailable check.
 */
export async function checkLegacyAccount(): Promise<LegacyAccountHint> {
  try {
    const { data, error } = await supabase.functions.invoke("legacy-account-check");
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
    return {
      exists: data.exists,
      accounts,
      email: typeof data.email === "string" ? data.email : undefined,
    };
  } catch {
    return { exists: null };
  }
}
