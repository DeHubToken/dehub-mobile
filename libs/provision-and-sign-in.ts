// Shared post-Supabase-login flow — mirrors dehubweb's proceedToWalletPhase +
// completeLoginWithoutUnlock. Both SignInScreen and SignInGatewayModal converge
// here so the two entry points can't drift.
import { ChainId } from "../config/constants";
import {
  getPreferredChainId,
  getAuthToken,
  getAuthUser,
  clearAuthData,
  setStoredSupabaseUserId,
  getStoredSupabaseUserId,
} from "./auth.utils";
import { createLogger } from "./logger";
import {
  resolveEvmWalletForIdentity,
  retryPendingResetCleanup,
} from "./identity-wallet";
import { stageIncomingIdentity } from "./profiles";
import { fetchWalletReliably } from "./wallet-core/store";
import { checkLegacyAccount } from "./wallet-core/legacy-detect";
import { getSupabaseUserId } from "../services/auth/supabaseAuth.service";
import type { SupabaseSessionExchangeResult } from "../hooks/useAuthSession";
import type { WalletSetupRequest } from "../components/auth/WalletSetupScreen";
import type { LegacyAccountMatch } from "./wallet-core/legacy-detect";

const log = createLogger("provision-and-sign-in");

const TARGET_CHAIN_ID = ChainId.BASE_MAINNET;

export type ProvisionOutcome =
  | { kind: "signed-in" }
  | { kind: "wallet-setup"; request: WalletSetupRequest }
  | { kind: "legacy-warning"; supabaseUserId: string; accounts: LegacyAccountMatch[] }
  | { kind: "error"; message: string };

export type ProvisionDeps = {
  getSupabaseAccessToken: () => Promise<string | null>;
  signInWithSupabaseSession: (
    accessToken: string,
    chainId: number,
    expectedAddress?: string,
    supabaseUserId?: string,
    opts?: { allowLocked?: boolean }
  ) => Promise<SupabaseSessionExchangeResult>;
  completeLocalSignIn: (
    address: string,
    privateKey: string,
    web3AuthMeta?: Record<string, any>
  ) => Promise<void>;
  getSupabaseAuthMeta: () => Promise<Record<string, any> | undefined>;
  provisionSolanaAddressForWallet: (
    address: string,
    privateKey: string
  ) => Promise<unknown>;
};

async function ensureSessionMatchesSupabaseIdentity(supabaseUserId: string): Promise<void> {
  const [cachedUid, token, user, liveSupabaseUid] = await Promise.all([
    getStoredSupabaseUserId(),
    getAuthToken(),
    getAuthUser<Record<string, unknown>>(),
    getSupabaseUserId(),
  ]);

  const activeSupabaseUid = liveSupabaseUid || supabaseUserId;
  const identityIsUnknownOrDifferent = !cachedUid || cachedUid !== activeSupabaseUid;
  const hasUntaggedStaleSession = !cachedUid && !!(token || user);

  if ((identityIsUnknownOrDifferent || hasUntaggedStaleSession) && (token || user)) {
    log.info("provision:staging-outgoing-session", {
      cachedUid: cachedUid ? `${cachedUid.slice(0, 8)}...` : null,
      activeSupabaseUid: `${activeSupabaseUid.slice(0, 8)}...`,
      untagged: hasUntaggedStaleSession,
    });
    // Stage, not clear.
    //
    // This ran clearAuthData, which deletes the token, user and address
    // outright. Further down the sign-in, displacesAnotherAccount decides
    // whether the account being replaced should be saved to the profile list —
    // and it answers that by reading those exact keys. Having just deleted
    // them it always answered no, so the outgoing account was never written
    // anywhere and simply ceased to exist on the device.
    //
    // stageIncomingIdentity does everything clearAuthData did — the same
    // session keys, the same Supabase entries — and preserves the outgoing
    // account into the profile list first, which is what makes a second login
    // additive. Add profile was never affected because it adopts the live
    // account before reaching here; every other route into a sign-in was.
    try {
      await stageIncomingIdentity();
    } catch (e) {
      // Never block a sign-in on the bookkeeping. Worst case is the old
      // behaviour: the outgoing account is not saved.
      log.warn("provision:stageIncomingIdentity:error", e);
      await clearAuthData();
    }
  }
}

async function markSupabaseIdentitySignedIn(supabaseUserId: string): Promise<void> {
  try {
    await setStoredSupabaseUserId(supabaseUserId);
  } catch (e) {
    log.warn("provision:setStoredSupabaseUserId:error", e);
  }
  // Finishes a wallet reset whose cleanup was interrupted. A no-op without a
  // marker, and it re-validates against the live row before touching anything.
  // Deliberately not awaited: it must never delay or fail a sign-in.
  void retryPendingResetCleanup(supabaseUserId).catch((e) =>
    log.warn("provision:retryPendingResetCleanup:error", e)
  );
}

async function waitForSupabaseSession(expectedUserId: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const uid = await getSupabaseUserId();
    if (uid === expectedUserId) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  log.warn("provision:supabase-session-wait-timeout", {
    expectedUserId: `${expectedUserId.slice(0, 8)}...`,
  });
}

async function trySessionExchange(
  accessToken: string,
  chainId: number,
  expectedAddress: string | undefined,
  supabaseUserId: string,
  deps: ProvisionDeps,
  opts?: { allowLocked?: boolean }
): Promise<SupabaseSessionExchangeResult> {
  try {
    return await deps.signInWithSupabaseSession(
      accessToken,
      chainId,
      expectedAddress,
      supabaseUserId,
      opts
    );
  } catch (e) {
    log.warn("provision:session-exchange:unexpected-error", e);
    return "failed";
  }
}

/**
 * After Supabase identity is established (Google/email), finish DeHub sign-in.
 *
 * The server selects the linked profile; wallet setup is only for new identities.
 */
export async function provisionAndSignIn(
  supabaseUserId: string,
  deps: ProvisionDeps
): Promise<ProvisionOutcome> {
  try {
    return await provisionAndSignInInner(supabaseUserId, deps);
  } catch (e) {
    log.error("provision:unhandled-error", e);
    // eslint-disable-next-line no-console
    console.error("[provision] unhandled error", e);
    const msg = e instanceof Error ? e.message : "Sign-in failed. Please try again.";
    return { kind: "error", message: msg };
  }
}

async function provisionAndSignInInner(
  supabaseUserId: string,
  deps: ProvisionDeps
): Promise<ProvisionOutcome> {
  if (!supabaseUserId || typeof supabaseUserId !== "string") {
    log.error("provision:invalid-supabase-user-id", { supabaseUserId });
    return { kind: "error", message: "Google sign-in did not return a valid session. Please try again." };
  }

  await ensureSessionMatchesSupabaseIdentity(supabaseUserId);
  await waitForSupabaseSession(supabaseUserId);

  const [preferred, accessToken] = await Promise.all([
    getPreferredChainId(), deps.getSupabaseAccessToken(),
  ]);
  if (!accessToken) return { kind: "error", message: "Your sign-in session expired. Please sign in again." };

  // Profile access is decided by the server's verified identity link, before
  // looking at wallet storage. Never release a key merely to enter the app.
  const outcome = await trySessionExchange(
    accessToken, preferred ?? TARGET_CHAIN_ID, undefined, supabaseUserId, deps,
    { allowLocked: true },
  );
  if (outcome === "linked") {
    await markSupabaseIdentitySignedIn(supabaseUserId);
    return { kind: "signed-in" };
  }
  if (outcome !== "not-linked") {
    return { kind: "error", message: "Could not finish signing in to your profile. Please try again." };
  }

  // Only a confirmed new identity can enter signup. Existing wallets never
  // turn an account-link failure into a password, biometric, or signature wall.
  const resolution = await resolveEvmWalletForIdentity(supabaseUserId);
  if (resolution.status !== "needs-create-password") {
    return { kind: "error", message: "Could not find the profile linked to this login. Please try again or contact support." };
  }
  const { wallet, failed } = await fetchWalletReliably(supabaseUserId);
  if (failed || wallet) {
    return { kind: "error", message: "Could not finish signing in to your profile. Please try again." };
  }
  const legacyHint = await checkLegacyAccount();
  if (legacyHint.exists === true && legacyHint.accounts?.length) {
    return { kind: "legacy-warning", supabaseUserId, accounts: legacyHint.accounts };
  }
  if (legacyHint.exists !== false) {
    return { kind: "error", message: "Could not check your existing profile. Please try again." };
  }
  return { kind: "wallet-setup", request: { mode: "create", supabaseUserId } };
}

/** Call after wallet unlock/create sign-in completes successfully. */
export async function markProvisionedIdentity(supabaseUserId: string): Promise<void> {
  await markSupabaseIdentitySignedIn(supabaseUserId);
}
