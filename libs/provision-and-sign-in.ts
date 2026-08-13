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
  getKnownWalletAddress,
  forgetLocalWalletForIdentity,
  type EvmWalletResolution,
} from "./identity-wallet";
import { fetchWallet, fetchWalletReliably } from "./wallet-core/store";
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
    supabaseUserId?: string
  ) => Promise<SupabaseSessionExchangeResult>;
  completeLocalSignIn: (
    address: string,
    privateKey: string,
    web3AuthMeta?: Record<string, any>
  ) => Promise<void>;
  getSupabaseAuthMeta: () => Promise<Record<string, any> | undefined>;
  getOrCreateSolanaKeypairForAddress: (address: string) => Promise<unknown>;
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
    log.info("provision:clearing-stale-session", {
      cachedUid: cachedUid ? `${cachedUid.slice(0, 8)}...` : null,
      activeSupabaseUid: `${activeSupabaseUid.slice(0, 8)}...`,
      untagged: hasUntaggedStaleSession,
    });
    await clearAuthData();
  }
}

async function markSupabaseIdentitySignedIn(supabaseUserId: string): Promise<void> {
  try {
    await setStoredSupabaseUserId(supabaseUserId);
  } catch (e) {
    log.warn("provision:setStoredSupabaseUserId:error", e);
  }
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
  deps: ProvisionDeps
): Promise<SupabaseSessionExchangeResult> {
  try {
    return await deps.signInWithSupabaseSession(
      accessToken,
      chainId,
      expectedAddress,
      supabaseUserId
    );
  } catch (e) {
    log.warn("provision:session-exchange:unexpected-error", e);
    return "failed";
  }
}

/**
 * After Supabase identity is established (Google/email), finish DeHub sign-in.
 *
 * Order (critical for correct account selection — mirrors dehubweb):
 * 1. Clear stale DeHub session when switching Google identities
 * 2. Resolve Supabase user_wallets FIRST (authoritative cross-device wallet)
 * 3. When no local wallet row exists at all, check for a pre-migration
 *    Web3Auth account BEFORE trusting a backend session exchange — an
 *    unverified exchange would otherwise blindly adopt a stale web3AuthMeta
 *    link and skip the legacy-recovery prompt (see LegacyAccountWarningModal)
 * 4. Session exchange with expectedAddress when user_wallets names one —
 *    refuse a polluted web3AuthMeta link (shubham_new) when the real wallet
 *    is shubham_new2 in user_wallets
 * 5. Unlock/create UI or local-key sign-in when session cannot adopt yet
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

  // These three are independent of each other and each cost a round trip
  // (device storage, Supabase session, the user_wallets read). Awaiting them
  // in sequence was serialising ~three latencies onto the sign-in critical
  // path for no ordering reason — the wallet read only has to come before the
  // session exchange, which is still below.
  const [preferred, accessToken, resolutionResult] = await Promise.all([
    getPreferredChainId(),
    deps.getSupabaseAccessToken(),
    // Same order as dehubweb proceedToWalletPhase → fetchWallet before unlock.
    resolveEvmWalletForIdentity(supabaseUserId),
  ]);
  const chainId = preferred ?? TARGET_CHAIN_ID;
  let resolution = resolutionResult;

  log.warn("provision:wallet-resolution", {
    status: resolution.status,
    address:
      "address" in resolution && resolution.address
        ? `${resolution.address.slice(0, 6)}...${resolution.address.slice(-4)}`
        : null,
  });
  // Always visible in Metro — DEBUG flag hides log.warn otherwise.
  // eslint-disable-next-line no-console
  console.error("[provision] wallet-resolution", resolution.status);

  // Cloud wallet needs a password/biometric unlock on this device — never
  // call /web/auth/supabase first; it always returns the polluted web3AuthMeta
  // link (shubham_new) instead of the user_wallets row (shubham_new2).
  if (
    resolution.status === "needs-unlock" ||
    resolution.status === "needs-biometric-unlock"
  ) {
    return routeToWalletUi(supabaseUserId, resolution, "not-linked", accessToken);
  }

  if (resolution.status === "needs-web-passkey-sync") {
    return routeToWalletUi(supabaseUserId, resolution, "not-linked", accessToken);
  }

  // Transient Supabase/RLS failures right after OAuth — one more resolve pass.
  if (resolution.status === "wallet-lookup-failed") {
    await new Promise((r) => setTimeout(r, 400));
    resolution = await resolveEvmWalletForIdentity(supabaseUserId);
    // eslint-disable-next-line no-console
    console.error("[provision] wallet-resolution retry after lookup-failed", resolution.status);
    if (
      resolution.status === "needs-unlock" ||
      resolution.status === "needs-biometric-unlock"
    ) {
      return routeToWalletUi(supabaseUserId, resolution, "not-linked", accessToken);
    }
  }

  // Set once a SECOND clean read has also come back with no row — i.e. two
  // independent successful lookups agree this identity has no cloud wallet.
  // Distinct from a failed lookup, which fetchWalletReliably reports as
  // `failed` and which must never be read as "no wallet exists".
  let confirmedNoCloudRow = false;

  // A single null read after OAuth is not proof there is no cloud wallet.
  if (resolution.status === "needs-create-password") {
    const confirm = await fetchWalletReliably(supabaseUserId);
    const { wallet: cloudRow, failed } = confirm;
    if (cloudRow?.ethAddress) {
      // Feed the row we just read straight back in rather than making
      // resolveEvmWalletForIdentity fetch it a third time.
      resolution = await resolveEvmWalletForIdentity(supabaseUserId, confirm);
      log.warn("provision:wallet-resolution:cloud-row-found-on-retry", {
        status: resolution.status,
        address:
          "address" in resolution && resolution.address
            ? `${resolution.address.slice(0, 6)}...${resolution.address.slice(-4)}`
            : null,
      });
      if (
        resolution.status === "needs-unlock" ||
        resolution.status === "needs-biometric-unlock"
      ) {
        return routeToWalletUi(supabaseUserId, resolution, "not-linked", accessToken);
      }
    } else if (failed) {
      resolution = { status: "wallet-lookup-failed" };
    } else {
      confirmedNoCloudRow = true;
    }
  }

  const knownAddress = getKnownWalletAddress(resolution);

  // No local ground truth (fresh/never-migrated identity) — check for a
  // pre-migration Web3Auth account BEFORE trusting a session exchange with
  // the backend. Session exchange without an expectedAddress blindly adopts
  // whatever web3AuthMeta link the backend has (see signInWithSupabaseSession
  // in hooks/useAuthSession.ts) — including a STALE link left over from a
  // previous sign-in/account switch, which would silently sign the user into
  // the wrong account and skip the legacy-recovery prompt entirely.
  if (resolution.status === "needs-create-password" && !knownAddress) {
    const legacyHint = await checkLegacyAccount();
    if (legacyHint.exists === true && legacyHint.accounts?.length) {
      log.warn("provision:legacy-account-found-before-session-exchange", {
        count: legacyHint.accounts.length,
      });
      return {
        kind: "legacy-warning",
        supabaseUserId,
        accounts: legacyHint.accounts,
      };
    }
  }

  let sessionOutcome: SupabaseSessionExchangeResult = "failed";

  // Only use session exchange when there is no cloud wallet row to unlock, or
  // when the lookup failed and the backend may still recognize web3AuthMeta.
  // Never exchange when user_wallets names an address that needs unlock —
  // /web/auth/supabase ignores user_wallets and returns the stale meta link.
  const mayUseSessionExchange =
    resolution.status === "needs-create-password" ||
    resolution.status === "wallet-lookup-failed" ||
    resolution.status === "ready";

  if (accessToken && mayUseSessionExchange) {
    sessionOutcome = await trySessionExchange(
      accessToken,
      chainId,
      knownAddress,
      supabaseUserId,
      deps
    );
    if (sessionOutcome === "linked") {
      log.warn("provision:session-exchange:ok", {
        phase: knownAddress ? "user-wallets-verified" : "no-wallet-row",
      });
      await markSupabaseIdentitySignedIn(supabaseUserId);
      return { kind: "signed-in" };
    }
    if (knownAddress && sessionOutcome === "not-linked") {
      log.warn("provision:session-exchange:rejected-wrong-backend-link", {
        expected: `${knownAddress.slice(0, 6)}...${knownAddress.slice(-4)}`,
      });
    }
    // Session exchange without a local signer (or wrong web3AuthMeta link) —
    // re-resolve so unlock UI targets shubham_new2 instead of create-wallet.
    //
    // Skipped once two clean reads have already agreed there is no cloud row
    // AND the backend has just said it does not recognize this identity
    // either: a third read can only return the same nothing, and it sits
    // directly between the user tapping "confirm code" and the wallet sheet
    // appearing. A FAILED lookup never reaches here — it resolves to
    // wallet-lookup-failed above, where re-reading is still the right move.
    if (sessionOutcome === "not-linked" && !confirmedNoCloudRow) {
      resolution = await resolveEvmWalletForIdentity(supabaseUserId);
      log.warn("provision:wallet-resolution:after-session-refused", {
        status: resolution.status,
      });
      if (
        resolution.status === "needs-unlock" ||
        resolution.status === "needs-biometric-unlock"
      ) {
        return routeToWalletUi(supabaseUserId, resolution, sessionOutcome, accessToken);
      }
    }
  }

  if (resolution.status === "ready") {
    return handleReadyResolution(supabaseUserId, resolution, sessionOutcome, deps, accessToken);
  }

  return routeToWalletUi(supabaseUserId, resolution, sessionOutcome, accessToken);
}

async function handleReadyResolution(
  supabaseUserId: string,
  resolution: Extract<EvmWalletResolution, { status: "ready" }>,
  sessionOutcome: SupabaseSessionExchangeResult,
  deps: ProvisionDeps,
  accessToken: string | null
): Promise<ProvisionOutcome> {
  const localAddr = resolution.address.toLowerCase();

  let remoteAddr: string | null = null;
  try {
    const remote = await fetchWallet(supabaseUserId);
    remoteAddr = remote?.ethAddress?.toLowerCase() ?? null;
  } catch {
    /* best-effort */
  }

  const supabaseRowMatchesLocal = !!remoteAddr && remoteAddr === localAddr;

  // Device holds a key the backend does not recognize for this Google identity
  // (e.g. shubham_new) while the real account (shubham_new2) is already linked
  // on web — never /mobile/auth with the orphan key.
  if (sessionOutcome === "not-linked" && !supabaseRowMatchesLocal) {
    log.warn("provision:ready-blocked-orphan-local-key", {
      local: `${localAddr.slice(0, 6)}...${localAddr.slice(-4)}`,
      remote: remoteAddr ? `${remoteAddr.slice(0, 6)}...${remoteAddr.slice(-4)}` : null,
    });
    await forgetLocalWalletForIdentity(supabaseUserId);
    const reresolved = await resolveEvmWalletForIdentity(supabaseUserId);
    return routeToWalletUi(supabaseUserId, reresolved, sessionOutcome, accessToken);
  }

  if (supabaseRowMatchesLocal) {
    try {
      const web3AuthMeta = await deps.getSupabaseAuthMeta();
      // Awaited so the Solana keypair is in SecureStore before sign-in
      // completes — a fire-and-forget call here raced posting/paying on
      // Solana right after sign-in, throwing "Solana wallet unavailable".
      await deps.getOrCreateSolanaKeypairForAddress(resolution.address).catch(() => {});
      await deps.completeLocalSignIn(resolution.address, resolution.privateKey, web3AuthMeta);
      await markSupabaseIdentitySignedIn(supabaseUserId);
      return { kind: "signed-in" };
    } catch (e) {
      log.warn("provision:ready-local-sign-in-failed", e);
      await forgetLocalWalletForIdentity(supabaseUserId).catch(() => {});
      const reresolved = await resolveEvmWalletForIdentity(supabaseUserId);
      return routeToWalletUi(supabaseUserId, reresolved, sessionOutcome, accessToken);
    }
  }

  await forgetLocalWalletForIdentity(supabaseUserId);
  const reresolved = await resolveEvmWalletForIdentity(supabaseUserId);
  return routeToWalletUi(supabaseUserId, reresolved, sessionOutcome, accessToken);
}

async function routeToWalletUi(
  supabaseUserId: string,
  resolution: EvmWalletResolution,
  sessionOutcome: SupabaseSessionExchangeResult,
  accessToken: string | null
): Promise<ProvisionOutcome> {
  if (resolution.status === "wallet-lookup-failed") {
    log.error("provision:wallet-lookup-failed", { supabaseUserId: `${supabaseUserId.slice(0, 8)}...` });
    return {
      kind: "error",
      message:
        "Could not load your wallet from the cloud. Check your connection and try again — do not create a new wallet if you already have an account.",
    };
  }

  if (resolution.status === "needs-unlock") {
    return {
      kind: "wallet-setup",
      request: {
        mode: "unlock",
        supabaseUserId,
        address: resolution.address,
        payload: resolution.payload,
      },
    };
  }

  if (resolution.status === "needs-biometric-unlock") {
    return {
      kind: "wallet-setup",
      request: {
        mode: "biometric-unlock",
        supabaseUserId,
        address: resolution.address,
        payload: resolution.payload,
      },
    };
  }

  if (resolution.status === "needs-web-passkey-sync") {
    return {
      kind: "wallet-setup",
      request: {
        mode: "web-passkey-sync",
        supabaseUserId,
        address: resolution.address,
      },
    };
  }

  const legacyHint = await checkLegacyAccount();
  if (legacyHint.exists === true && legacyHint.accounts?.length) {
    return {
      kind: "legacy-warning",
      supabaseUserId,
      accounts: legacyHint.accounts,
    };
  }

  if (sessionOutcome === "not-linked") {
    log.info("provision:route-to-create", { supabaseUserId: `${supabaseUserId.slice(0, 8)}...` });
  }

  return {
    kind: "wallet-setup",
    request: { mode: "create", supabaseUserId },
  };
}

/** Call after wallet unlock/create sign-in completes successfully. */
export async function markProvisionedIdentity(supabaseUserId: string): Promise<void> {
  await markSupabaseIdentitySignedIn(supabaseUserId);
}
