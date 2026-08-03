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
} from "../libs/auth.utils";
import { AuthService, WalletNotLinkedError, WalletLinkAmbiguousError } from "../services";
import { apiClient } from "../libs/api.client";
import { clearSigningProvider } from "../libs/provider.registry";
import { getPrivateKeyForAddress } from "../libs/wallets.local";
import { clearPersistedNavigationState } from "./useNavigationPersistence";
import { unregisterPushTokens } from "../services/push/push.service";
import { createLocalEip1193ProviderForChain } from "../services/localwallet.provider";
import { getAppKitInstance } from "../config/reown.config";
// balances fetching centralized in useBalances

type Logger = {
  debug: (...a: any[]) => void;
  info: (...a: any[]) => void;
  warn: (...a: any[]) => void;
};

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

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      // Unregister push tokens before clearing auth
      try {
        await unregisterPushTokens();
      } catch (e) {
        log.warn('signOut:unregisterPushTokens:error', e as any);
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
        await signOut();
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
        else await ensureProvider();
      } catch (e) {
        log.warn("ensureProvider:failed", e);
      }
      await setHasSeenAuth();
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
   * `expectedAddress`, when the caller already knows which wallet this
   * identity SHOULD map to (from the Supabase-stored wallet seed — the
   * authoritative source, see identity-wallet.ts), is compared against what
   * the backend resolves. Mirrors dehubweb's completeLoginWithoutUnlock: the
   * web3AuthMeta link has no uniqueness constraint on the backend, so it CAN
   * point to the wrong account (two different logins each set it on their
   * own address, last write wins) — a caller with its own known-correct
   * address must never have it silently overridden by that link. On
   * mismatch this returns false exactly like "not linked", so the caller
   * falls back to proving the expected address by other means (e.g.
   * unlocking it with a password) instead of adopting the wrong one.
   *
   * Without expectedAddress (no local ground truth to check against), this
   * always adopts the session once the backend resolves ANY linked address —
   * refusing to recognize it would just cause the caller to mint a brand-new
   * (wrong) account instead, which is the bug this shortcut exists to
   * prevent in the first place. When no local key is available the user is
   * signed in without a working signer (ensureProvider fails silently, same
   * as any other provider-init failure) until the key is imported/recovered
   * on this device. Returns false whenever the caller should fall back to
   * the normal provisioning flow (not linked, mismatched, or any
   * network/server error) — never throws for those, since this is always a
   * best-effort shortcut ahead of the real sign-in flow. The one exception
   * is WalletLinkAmbiguousError: that means the backend already has MORE
   * THAN ONE wallet linked to this identity, so falling back to
   * provisioning would mint and link a THIRD conflicting wallet, making the
   * ambiguity permanently worse. It is rethrown so the caller can stop and
   * point the user at Import Wallet instead of silently creating another
   * account.
   */
  const signInWithSupabaseSession = useCallback(
    async (supabaseAccessToken: string, chainId: number, expectedAddress?: string): Promise<boolean> => {
      setIsLoading(true);
      try {
        let res: Awaited<ReturnType<typeof AuthService.authenticateWithSupabaseSession>>;
        try {
          res = await AuthService.authenticateWithSupabaseSession(supabaseAccessToken);
        } catch (e) {
          if (e instanceof WalletLinkAmbiguousError) {
            log.warn("signInWithSupabaseSession:ambiguous-link");
            throw e;
          }
          if (e instanceof WalletNotLinkedError) {
            log.info("signInWithSupabaseSession:not-linked");
          } else {
            log.warn("signInWithSupabaseSession:error", e);
          }
          return false;
        }

        const address = (res.user as any)?.address as string | undefined;
        if (!address) return false;

        if (expectedAddress && address.toLowerCase() !== expectedAddress.toLowerCase()) {
          log.warn("signInWithSupabaseSession:address-mismatch — falling back", {
            linked: `${address.slice(0, 6)}...${address.slice(-4)}`,
            expected: `${expectedAddress.slice(0, 6)}...${expectedAddress.slice(-4)}`,
          });
          return false;
        }

        // getPrivateKeyForAddress checks existence before doing anything that
        // could prompt biometrics, so this is safe to call unconditionally.
        const privateKey = await getPrivateKeyForAddress(address, {
          purpose: "Sign in to DeHub",
        });
        if (!privateKey) {
          log.warn("signInWithSupabaseSession:no-local-key-for-linked-address — adopting session without a signer", {
            address: `${address.slice(0, 6)}...${address.slice(-4)}`,
          });
        }
        const localProvider = privateKey
          ? createLocalEip1193ProviderForChain(privateKey, chainId)
          : null;
        try {
          await setAuthMethod("local", address);
          try {
            setAuthMethodState("local");
          } catch {}
        } catch {}

        await applyWalletAuthResult(res.user, res.token, !!res.needsUsername, chainId, localProvider);
        return true;
      } finally {
        setIsLoading(false);
      }
    },
    [applyWalletAuthResult, log, setAuthMethodState, setIsLoading]
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
