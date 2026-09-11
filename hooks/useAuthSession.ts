import { useCallback, useRef } from "react";
import { maxStacked } from "../libs/validators.util";
import { setHasSeenAuth, toastError } from "../libs";
import { getAccount, getNotifications } from "../services/user.service";
import { upsertLocalAccount, getLocalAccount } from "../libs/wallets.local";

import type { User } from "../context/AuthContext";
import { createAuthAdapter } from "../services/auth/authAdapter";
import {
  setAuthMethod,
  clearAuthMethod,
  getPreferredChainId,
  getRefreshToken,
  setStoredSupabaseUserId,
  setAuthToken,
  setRefreshToken,
  setTokenExpiresAt,
} from "../libs/auth.utils";
import { AuthService, WalletNotLinkedError, WalletLinkAmbiguousError } from "../services";
import { apiClient } from "../libs/api.client";
import { clearEoaSigningProvider, clearSigningProvider } from "../libs/provider.registry";
import { clearPersistedNavigationState } from "./useNavigationPersistence";
import { unregisterPushTokens } from "../services/push/push.service";
import { getAppKitInstance } from "../config/reown.config";
import { getSupabaseUserId } from "../services/auth/supabaseAuth.service";
import { predictSafeAddress } from "../libs/wallet-core/predict-safe-address";
import {
  takeWalletDrift,
  clearWalletDrift,
  isIdentitysOwnWallet,
} from "../libs/wallet-drift";
import {
  currentProfileId,
  displacesAnotherAccount,
  stageIncomingIdentity,
} from "../libs/profiles";
// balances fetching centralized in useBalances

type Logger = {
  debug: (...a: any[]) => void;
  info: (...a: any[]) => void;
  warn: (...a: any[]) => void;
};

export type SupabaseSessionExchangeResult = "linked" | "not-linked" | "failed";

type SessionDeps = {
  log: Logger;
  setIsLoading: (v: boolean) => void;
  setIsSignedIn: (v: boolean) => void;
  setIsFirstTimeUser: (v: boolean) => void;
  setNeedsUsername: (v: boolean) => void;
  setProvisionalUser: (u: any | null) => void;
  setProvisionalToken: (t: string | null) => void;
  setUser: (u: any) => void;
  setAuthUser: (u: User) => Promise<void>;
  setBalancesLoading: (v: boolean) => void;
  setChainId: (id: number | undefined) => void;
  setShowSignInModal: (v: boolean) => void;
  getSigningProvider: () => any;
  ensureProvider: () => Promise<void>;
  /** Bypasses ensureProvider's "already ready" guard -- see applyWalletAuthResult. */
  forceReinitProvider: () => Promise<void>;
  adoptProvider: (prov: any) => Promise<void>;
  fetchAndStoreBalances: (u: User, chainIdOverride?: number) => Promise<void>;
  clearAuthData: () => Promise<void>;
  providerReset: () => void;
  isMountedRef: { current: boolean };
  setAuthMethodState: (v: "local" | null) => void;
  didBootRefetchRef: { current: boolean };
};

export function useAuthSession({
  log,
  setIsLoading,
  setIsSignedIn,
  setIsFirstTimeUser,
  setNeedsUsername,
  setProvisionalUser,
  setProvisionalToken,
  setUser,
  setAuthUser,
  setBalancesLoading,
  setChainId,
  setShowSignInModal,
  getSigningProvider,
  ensureProvider,
  forceReinitProvider,
  adoptProvider,
  fetchAndStoreBalances,
  clearAuthData,
  providerReset,
  isMountedRef,
  setAuthMethodState,
  didBootRefetchRef,
}: SessionDeps) {
  const persistLocalAccountIfPossible = useCallback(async (enriched: User) => {
    try {
      const address = enriched?.walletAddress || enriched?.address;
      const username = enriched?.username;
      if (!address) return;
      const existing = await getLocalAccount(address);
      if (!existing) return;
      if (username && existing.username !== username) {
        await upsertLocalAccount({ address, username });
      }
    } catch {}
  }, []);

  // Throttle guard: skip getAccount if called within this window (ms)
  const ENRICH_THROTTLE_MS = 15_000;
  const lastEnrichTsRef = useRef<number>(0);

  const enrichAndStoreUser = useCallback(
    async (
      base: User,
      opts?: {
        refetch?: boolean;
        cacheBustImages?: boolean;
        force?: boolean; // bypass throttle
      }
    ): Promise<User> => {
      const t0 = Date.now();
      log.debug("enrich:start", {
        baseId: base?.address,
        refetch: !!opts?.refetch,
        cacheBustImages: !!opts?.cacheBustImages,
        t0,
      });
      const shouldRefetch = !!opts?.refetch;
      let enriched = base;
      const tFetchStart = Date.now();
      const sinceLastEnrich = tFetchStart - lastEnrichTsRef.current;
      const throttled = !opts?.force && sinceLastEnrich < ENRICH_THROTTLE_MS;
      const addr = base.walletAddress || base.address;
      const key = base.username || base.walletAddress || base.address;

      if (shouldRefetch && !throttled && key && addr) {
        lastEnrichTsRef.current = tFetchStart;
        // Fire getAccount and getNotifications in parallel
        const [accountResult, notifResult] = await Promise.allSettled([
          getAccount(key),
          getNotifications({ limit: 20 }),
        ]);

        if (accountResult.status === "fulfilled") {
          const res: any = accountResult.value;
          const core = res?.data?.result || res?.result || null;
          if (core) enriched = { ...base, ...core } as User;
          log.debug("enrich:getAccount:done", {
            key,
            merged: !!core,
            ms: Date.now() - tFetchStart,
          });
        } else {
          log.warn("enrich:getAccount:error", { error: accountResult.reason, ms: Date.now() - t0 });
        }

        if (notifResult.status === "fulfilled") {
          const nRes: any = notifResult.value;
          const notificationRes = nRes?.data?.result || nRes?.result || nRes;
          if (notificationRes) {
            const unread = (notificationRes as any[]).length;
            enriched = { ...enriched, notificationCount: unread };
            log.debug("enrich:notifications:done", {
              unread,
              ms: Date.now() - tFetchStart,
            });
          }
        } else {
          log.warn("enrich:notifications:error", { error: notifResult.reason, ms: Date.now() - t0 });
        }
      } else if (shouldRefetch && throttled) {
        log.debug("enrich:getAccount:throttled", {
          sinceLastMs: sinceLastEnrich,
          throttleMs: ENRICH_THROTTLE_MS,
        });
      }
      // Balances fetching is no longer handled inside enrich; done elsewhere
      try {
        const tPostStart = Date.now();
        // Prefer badgeBalance from backend; fall back to derived from balanceData
        if (typeof (enriched as any).badgeBalance === 'number' && (enriched as any).badgeBalance > 0) {
          enriched = { ...enriched, stakedDHB: (enriched as any).badgeBalance };
        } else if (enriched?.balanceData?.length) {
          const derivedStake = maxStacked(enriched.balanceData);
          if (typeof derivedStake === "number")
            enriched = { ...enriched, stakedDHB: derivedStake };
        }
        if (opts?.cacheBustImages) {
          const bust = (u?: string) =>
            u
              ? u.includes("ts=")
                ? u.replace(/([?&])ts=\d+/, `$1ts=${Date.now()}`)
                : `${u}${u.includes("?") ? "&" : "?"}ts=${Date.now()}`
              : u;
          const next: Partial<User> = {};
          if (enriched.avatarImageUrl)
            next.avatarImageUrl = bust(enriched.avatarImageUrl);
          if (enriched.coverImageUrl)
            next.coverImageUrl = bust(enriched.coverImageUrl);
          enriched = { ...enriched, ...next } as User;
        }
        if (isMountedRef.current) {
          setUser(enriched);
          await setAuthUser(enriched);
        }
        log.debug("enrich:setAuthUser:done", {
          userId: enriched?.id,
          ms: Date.now() - tPostStart,
          totalMs: Date.now() - t0,
        });
      } catch (e) {
        log.warn("enrich:setAuthUser:error", {
          error: e,
          totalMs: Date.now() - t0,
        });
      }
      return enriched;
    },
    [isMountedRef, log, setAuthUser, setUser]
  );

  const signOut = useCallback(
    async (forgetProfile: boolean = true) => {
    setIsLoading(true);
    // Belongs to the identity signing out — the next one must not inherit it.
    clearWalletDrift();
    try {
      // Unregister push tokens before clearing auth
      try {
        await unregisterPushTokens();
      } catch (e) {
        log.warn('signOut:unregisterPushTokens:error', e as any);
      }
      // "Log out" means this device forgets the session — its stored profile
      // snapshot (now-dead tokens) goes with it. Other saved profiles stay.
      // Session-expiry paths pass false so a possibly-recoverable stash
      // survives; restoring it will simply fail into the sign-in sheet.
      if (forgetProfile) {
        try {
          const pid = await currentProfileId();
          if (pid) {
            const { removeProfile } = await import('../libs/profiles');
            await removeProfile(pid);
          }
        } catch (e) {
          log.warn('signOut:removeProfile:error', e as any);
        }
      }
      // Revoke the refresh token on the backend (best-effort)
      try {
        const refreshToken = await getRefreshToken();
        if (refreshToken) {
          await apiClient.post('/auth/logout', { refreshToken });
        }
      } catch (e) {
        log.warn('signOut:revokeRefreshToken:error', e as any);
      }
      // Disconnect any WalletConnect (Connect Wallet) session — otherwise
      // AppKit's connection outlives the DeHub sign-out, and the next visit
      // to the sign-in screen auto-authenticates with whatever wallet was
      // last connected instead of showing the sign-in options. Mirrors
      // dehubweb's clearWagmiStorage() call on disconnect.
      try {
        await getAppKitInstance()?.disconnect();
      } catch (e) {
        log.warn('signOut:disconnectWalletConnect:error', e as any);
      }
      // Also end the Supabase (Google/email) identity session — otherwise the
      // next "Sign in with Google" resumes the previous identity's session
      // instead of asking who is signing in. scope 'local' clears only THIS
      // device; 'global' would revoke the user's web sessions too.
      try {
        const { supabase } = await import('../services/supabase');
        await supabase.auth.signOut({ scope: 'local' });
      } catch (e) {
        log.warn('signOut:supabaseSignOut:error', e as any);
      }
      await clearAuthData();
      setUser(null);
      setIsSignedIn(false);
      setNeedsUsername(false);
      setProvisionalUser(null);
      setProvisionalToken(null);
      setBalancesLoading(false);
      providerReset();
      clearEoaSigningProvider();
      clearSigningProvider();
      // Clear persisted navigation state to prevent restoring auth-gated screens
      clearPersistedNavigationState();
      try {
        setAuthMethodState(null);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  }, [
    log,
    clearAuthData,
    providerReset,
    setBalancesLoading,
    setIsLoading,
    setIsSignedIn,
    setNeedsUsername,
    setProvisionalUser,
    setProvisionalToken,
    setUser,
    setAuthMethodState,
  ]);

  const handleSessionExpired = useCallback(
    async (trigger: string) => {
      // surface toast here to keep context thin
      toastError?.("Session expired, login again");
      try {
        // Keep the stored profile snapshot — the account itself is fine; only
        // this session's tokens died.
        await signOut(false);
      } catch {}
      setShowSignInModal(true);
    },
    [setShowSignInModal, signOut]
  );

  // Shared tail of a successful wallet authentication: adopt the signing
  // provider, then either park the user on username setup or fully sign
  // them in. Used by both signInWithWallet (signature flow) and
  // signInWithSupabaseSession (session-exchange flow) so the two paths
  // can't drift on what "signed in" means.
  const applyWalletAuthResult = useCallback(
    async (
      walletUser: any,
      token: any,
      needsUsername: boolean,
      chainId: number,
      preOverride: any
    ) => {
      try {
        if (preOverride && typeof preOverride.request === "function")
          await adoptProvider(preOverride);
        else
          // ensureProvider() no-ops when a provider from a PREVIOUS
          // account is still marked "ready" (see useProviderLifecycle) --
          // signing would then silently keep using that old account's key
          // even though this session just switched to a different one
          // (confirmed on-chain: a mint transaction signed by a stale
          // account after a same-session identity switch). forceReinitProvider
          // bypasses that guard and always rebuilds against the JUST-
          // established session.
          await forceReinitProvider();
      } catch (e) {
        log.warn("ensureProvider:failed", e);
      }
      await setHasSeenAuth();
      try {
        const uid = await getSupabaseUserId();
        if (uid) await setStoredSupabaseUserId(uid);
      } catch {}
      // Multi-account bookkeeping: every key this session owns is on disk.
      // An Add profile attempt adopts the new account explicitly; any other
      // login (including same-user session refreshes) only refreshes what is
      // already listed, so a borrowed phone never turns into a directory of
      // whoever once signed in here. Mirrors dehubweb's
      // applyAuthenticatedSession tail.
      try {
        const profiles = await import('../libs/profiles');
        const attemptedFrom = profiles.consumeAddProfileAttempt();
        if (attemptedFrom !== undefined) await profiles.adoptCurrentProfile();
        else await profiles.snapshotCurrentSession();
      } catch (e) {
        const profiles = await import('../libs/profiles');
        if (e instanceof profiles.ProfileLimitReachedError) {
          // The sign-in itself succeeded; only the saving of it to the device
          // list was refused. Say so, and name the tier that would lift it —
          // silence here would look like the account simply not appearing.
          const { allowance } = e;
          toastError(
            e,
            `You can keep ${allowance.maxProfiles} profiles on this device`,
          );
          log.warn('applyWalletAuthResult:profileLimitReached', {
            maxProfiles: allowance.maxProfiles,
            tierName: allowance.tierName,
            nextTierName: allowance.nextTierName,
          } as any);
        } else {
          log.warn('applyWalletAuthResult:profilesTail:error', e as any);
        }
      }
      if (needsUsername) {
        setNeedsUsername(true);
        setProvisionalUser(walletUser);
        setProvisionalToken(token);
      } else {
        setIsFirstTimeUser(false);
        setNeedsUsername(false);
        setProvisionalUser(null);
        setProvisionalToken(null);
        setIsSignedIn(true);
        const enriched = await enrichAndStoreUser(walletUser, {
          refetch: true,
        });
        // Prevent the consolidated boot effect from duplicating this enrich
        didBootRefetchRef.current = true;
        await persistLocalAccountIfPossible(enriched);
        try {
          setBalancesLoading(true);
        } catch {}
        try {
          fetchAndStoreBalances(enriched, chainId).catch(() => {});
        } catch {}
      }
    },
    [
      adoptProvider,
      enrichAndStoreUser,
      ensureProvider,
      fetchAndStoreBalances,
      log,
      persistLocalAccountIfPossible,
      setBalancesLoading,
      setIsFirstTimeUser,
      setIsSignedIn,
      setNeedsUsername,
      setProvisionalToken,
      setProvisionalUser,
    ]
  );

  /**
   * Move this identity's account onto the wallet about to sign, when the
   * exchange just found the account somewhere this device cannot sign for.
   *
   * Runs BEFORE AuthService.signInWithWallet, and that order is load-bearing:
   * a signature login sends web3AuthMeta, and the backend makes that link
   * exclusive by unsetting it on every other account — including the one being
   * rescued, after which nothing can look it up.
   *
   * Only the identity's OWN wallet is allowed to be the destination — the EOA
   * user_wallets names, or the Safe predicted from it. Anything else signing in
   * is a different wallet the user reached deliberately (an imported key, an
   * external wallet), and on this client that already means "switch accounts";
   * turning it into "bring the account along" would be a surprise, not a fix.
   *
   * Never throws. A backend without the endpoint, a link pointing nowhere and
   * an account that already moved all land in the same warn, and the sign-in
   * continues to exactly today's behaviour.
   */
  const moveDriftedAccountToThisWallet = useCallback(
    async (signInAddress: string, chainId: number) => {
      const drift = takeWalletDrift();
      if (!drift) return;

      const signing = signInAddress.toLowerCase();
      if (signing === drift.linked) return; // already where it belongs

      const predicted =
        signing === drift.ownerEoa ? null : await predictSafeAddress(drift.ownerEoa);
      if (!isIdentitysOwnWallet(drift, signing, predicted)) {
        log.info("walletDrift:not-this-identitys-wallet-skipping", {
          signing: `${signing.slice(0, 6)}...${signing.slice(-4)}`,
        });
        return;
      }

      try {
        await AuthService.rotateWallet(signInAddress, chainId);
        log.warn("walletDrift:moved-account-onto-this-wallet", {
          from: `${drift.linked.slice(0, 6)}...${drift.linked.slice(-4)}`,
          to: `${signing.slice(0, 6)}...${signing.slice(-4)}`,
        });
      } catch (e: any) {
        // WalletNotLinkedError is the ordinary answer when there is nothing to
        // move; anything else means the sign-in that follows is about to make a
        // duplicate account or be refused by the signup gate.
        log.warn("walletDrift:move-failed-continuing", {
          from: `${drift.linked.slice(0, 6)}...${drift.linked.slice(-4)}`,
          to: `${signing.slice(0, 6)}...${signing.slice(-4)}`,
          reason: e?.message || String(e),
        });
      }
    },
    [log]
  );

  const signInWithWallet = useCallback(
    async (walletAddress: string, chainId: number, overridePrivateKey?: string, web3AuthMeta?: Record<string, any>) => {
      const mask = (addr?: string) =>
        addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : undefined;
      log.info("signInWithWallet:start", {
        walletAddress: mask(walletAddress),
        chainId,
        preferred: await getPreferredChainId(),
        hasOverridePk: !!overridePrivateKey,
        hasWeb3AuthMeta: !!web3AuthMeta,
      });
      setIsLoading(true);
      try {
        // capture override provider BEFORE any flow clears it
        const preOverride = getSigningProvider();
        const hasOverride = !!preOverride;
        log.debug("signInWithWallet:hasOverride", { hasOverride, preOverride });
        // Multi-account: signing in while another account is live (Add
        // profile) snapshots the outgoing session and clears its keys BEFORE
        // the exchange writes the incoming ones — identities must never blend
        // on disk, and a stale auth_supabase_uid would mislink the new login.
        try {
          if (await displacesAnotherAccount(walletAddress)) {
            await stageIncomingIdentity();
          }
        } catch (e) {
          log.warn("signInWithWallet:stageIncoming:error", e as any);
        }
        // Every sign-in path (social/email-provisioned or imported wallet)
        // sets a local signing-provider override before calling this.
        const methodNow: "local" = "local";
        try {
          await setAuthMethod(methodNow, walletAddress);
          try {
            setAuthMethodState(methodNow);
          } catch {}
        } catch {}
        // Only fetch private key for local wallets; web3auth never exposes one.
        // Local override wallets already provide key via overridePrivateKey param.
        let privateKey: string | undefined;
        if (hasOverride && !overridePrivateKey) {
          try {
            const adapter = createAuthAdapter();
            log.debug("getPrivateKey:begin");
            privateKey = await adapter.getPrivateKey?.();
            log.debug("getPrivateKey:done", {
              hasKey: !!privateKey,
              length: privateKey?.length || 0,
            });
          } catch (e) {
            log.warn("getPrivateKey:error", e);
          }
        }
        let walletUser: any;
        let token: any;
        let needsUsername: boolean = false;
        // Before the signature is spent: this reuses the cached auth signature
        // rather than raising a second prompt, and it must precede the login
        // that would unset the link it needs.
        await moveDriftedAccountToThisWallet(walletAddress, chainId);
        try {
          const res = await AuthService.signInWithWallet(
            walletAddress,
            chainId,
            hasOverride && overridePrivateKey
              ? { privateKey: overridePrivateKey, web3AuthMeta }
              : privateKey
              ? { privateKey, web3AuthMeta }
              : web3AuthMeta
              ? { web3AuthMeta }
              : undefined
          );
          walletUser = (res as any).user;
          token = (res as any).token;
          needsUsername = !!(res as any).needsUsername;
        } catch (e) {
          try {
            await clearAuthMethod();
          } catch {}
          try {
            setAuthMethodState(null);
          } catch {}
          throw e;
        }
        // prefer the captured override even if a later read is cleared
        await applyWalletAuthResult(walletUser, token, needsUsername, chainId, preOverride);
      } finally {
        setIsLoading(false);
      }
    },
    [
      applyWalletAuthResult,
      getSigningProvider,
      log,
      moveDriftedAccountToThisWallet,
      setAuthMethodState,
      setChainId,
      setIsLoading,
    ]
  );

  /**
   * Exchange a Supabase access token (Google/email sign-in) for a DeHub
   * session with no wallet signature — used when this Supabase identity is
   * already linked to an account (a link established by a previous
   * signInWithWallet call's web3AuthMeta, on this or another device).
   *
   * Local wallet state cannot override the server-authenticated profile.
   * Signature operations verify their wallet independently when requested.
   */
  const signInWithSupabaseSession = useCallback(
    async (
      supabaseAccessToken: string,
      chainId: number,
      _expectedAddress?: string,
      supabaseUserId?: string,
      // Kept for caller compatibility; session exchange always leaves keys locked.
      _opts?: { allowLocked?: boolean }
    ): Promise<SupabaseSessionExchangeResult> => {
      setIsLoading(true);
      try {
        if (supabaseUserId && await getSupabaseUserId() !== supabaseUserId) return "failed";
        let res: Awaited<ReturnType<typeof AuthService.authenticateWithSupabaseSession>>;
        try {
          res = await AuthService.authenticateWithSupabaseSession(supabaseAccessToken, expectedAddress);
        } catch (e) {
          if (e instanceof WalletLinkAmbiguousError) {
            log.warn("signInWithSupabaseSession:ambiguous-link");
            throw e;
          }
          if (e instanceof WalletNotLinkedError) {
            log.info("signInWithSupabaseSession:not-linked");
            return "not-linked";
          }
          log.warn("signInWithSupabaseSession:error", e);
          return "failed";
        }

        const address = (
          (res.user as any)?.address ||
          (res.user as any)?.walletAddress ||
          (res as any)?.result?.address
        ) as string | undefined;
        if (!res.token || !address || !/^0x[0-9a-f]{40}$/i.test(address)) {
          log.warn("signInWithSupabaseSession:no-address-in-response");
          return "failed";
        }

        // The verified server identity link selects the profile. Wallet keys
        // are released only by a later wallet action, never by session exchange.
        // Multi-account staging, same as the wallet path: the exchange just
        // resolved to `address`, so any live keys for a DIFFERENT account must
        // be snapshotted and cleared before this session's identity is adopted.
        //
        // This has to run BEFORE the tokens below are written, not after.
        // stageIncomingIdentity clears the session keys — including the three
        // this function has just set — so running it second deleted the new
        // session's own tokens the moment the second account was a different
        // one. signInWithWallet gets this right and says so in its own comment
        // ("BEFORE the exchange writes the incoming ones"); this path had the
        // same comment but the opposite order.
        try {
          if (await displacesAnotherAccount(address)) {
            await stageIncomingIdentity();
          }
        } catch (e) {
          log.warn("signInWithSupabaseSession:stageIncoming:error", e as any);
        }

        await setAuthToken(res.token);
        if (res.refreshToken) await setRefreshToken(res.refreshToken);
        if (res.expiresIn) await setTokenExpiresAt(Date.now() + res.expiresIn * 1000);

        // No key in hand means no provider to adopt here. applyWalletAuthResult
        // falls through to forceReinitProvider, which asks LocalProviderAdapter
        // — and that now hands back the locked shim rather than null, so the
        // session comes up complete with reads working and signing deferred.
        const localProvider = null;
        try {
          await setAuthMethod("local", address);
          try {
            setAuthMethodState("local");
          } catch {}
        } catch {}

        await applyWalletAuthResult(res.user, res.token, !!res.needsUsername, chainId, localProvider);
        return "linked";
      } finally {
        setIsLoading(false);
      }
    },
    [applyWalletAuthResult, clearAuthData, log, setAuthMethodState, setIsLoading]
  );

  const completeUsername = useCallback(
    (finalUser: User) => {
      setBalancesLoading(true);
      setIsSignedIn(true);
      setIsFirstTimeUser(false);
      setNeedsUsername(false);
      setProvisionalUser(null);
      setProvisionalToken(null);
      enrichAndStoreUser(finalUser, { refetch: true })
        .then(async (u) => {
          await persistLocalAccountIfPossible(u);
          try {
          } catch {}
          try {
            fetchAndStoreBalances(u).catch(() => {});
          } catch {}
        })
        .catch(async () => {
          setUser(finalUser);
          try {
            await setAuthUser(finalUser);
          } catch {}
        });
    },
    [
      enrichAndStoreUser,
      fetchAndStoreBalances,
      setAuthUser,
      setIsFirstTimeUser,
      setIsSignedIn,
      setNeedsUsername,
      setProvisionalToken,
      setProvisionalUser,
      setUser,
    ]
  );

  const requireAuth = useCallback(
    (action: () => void, isSignedIn: boolean, needsUsername: boolean) => {
      if (isSignedIn && !needsUsername) action();
      else setShowSignInModal(true);
    },
    [setShowSignInModal]
  );

  const skipAuth = useCallback(async () => {
    const { setHasSeenAuth } = await import("../libs/auth.utils");
    await setHasSeenAuth();
    setIsFirstTimeUser(false);
  }, [setIsFirstTimeUser]);

  const patchUser = useCallback(
    async (
      current: User | null,
      update: Partial<User> | ((prev: User) => Partial<User>)
    ) => {
      if (!current) return null;
      const partial = typeof update === "function" ? update(current) : update;
      if (!partial || typeof partial !== "object") return current;
      const merged: User = { ...current, ...partial };
      setUser(merged);
      try {
        await setAuthUser(merged);
      } catch {}
      return merged;
    },
    [setAuthUser, setUser]
  );

  const refreshUser = useCallback(
    async (current: User | null) => {
      if (!current) return;
      const updated = await enrichAndStoreUser(current, {
        refetch: true,
        cacheBustImages: true,
        force: true, // bypass throttle for explicit refresh
      });
      // Also refresh on-chain balances as part of a manual refresh
      try {
        setBalancesLoading(true);
      } catch {}
      try {
        await fetchAndStoreBalances(updated);
      } catch {}
    },
    [enrichAndStoreUser, fetchAndStoreBalances, setBalancesLoading]
  );

  return {
    signInWithWallet,
    signInWithSupabaseSession,
    completeUsername,
    requireAuth,
    skipAuth,
    patchUser,
    refreshUser,
    persistLocalAccountIfPossible,
    enrichAndStoreUser,
    handleSessionExpired,
    signOut,
  };
}
