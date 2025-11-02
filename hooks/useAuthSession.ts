import { useCallback } from "react";
import { maxStacked } from "../libs/validators.util";
import { setHasSeenAuth, toastError } from "../libs";
import { getAccount, getNotifications } from "../services/user.service";
import { upsertLocalAccount, getLocalAccount } from "../libs/wallets.local";

import type { User } from "../context/AuthContext";
import { createAuthAdapter } from "../services/auth/authAdapter";
import { setAuthMethod, clearAuthMethod } from "../libs/auth.utils";
import { AuthService } from "../services";
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
  fetchAndStoreBalances: (u: User) => Promise<void>;
  clearAuthData: () => Promise<void>;
  providerReset: () => void;
  isMountedRef: { current: boolean };
  setAuthMethodState: (v: 'local' | 'web3auth' | null) => void;
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

  const enrichAndStoreUser = useCallback(
    async (
      base: User,
      opts?: {
        refetch?: boolean;
        cacheBustImages?: boolean;
        skipBalances?: boolean;
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
      try {
        const tFetchStart = Date.now();
        if (shouldRefetch) {
          const key = base.username || base.walletAddress || base.address;
          if (key) {
            const res: any = await getAccount(key);
            const core = res?.data?.result || res?.result || null;
            if (core) enriched = { ...base, ...core } as User;
            log.debug("enrich:getAccount:done", {
              key,
              merged: !!core,
              ms: Date.now() - tFetchStart,
              sinceStart: Date.now() - t0,
            });
          }
        }
      } catch (e) {
        log.warn("enrich:getAccount:error", { error: e, ms: Date.now() - t0 });
      }
      try {
        const tNotifStart = Date.now();
        const addr = enriched.walletAddress || enriched.address;
        if (addr) {
          const nRes: any = await getNotifications(addr, { unit: 20 });
          const notificationRes = nRes?.data?.result || nRes?.result || nRes;
          if (notificationRes) {
            const unread = (notificationRes as any[]).length;
            enriched = { ...enriched, notificationCount: unread };
            log.debug("enrich:notifications:done", {
              unread,
              ms: Date.now() - tNotifStart,
              sinceStart: Date.now() - t0,
            });
          }
        }
      } catch (e) {
        log.warn("enrich:notifications:error", {
          error: e,
          sinceStart: Date.now() - t0,
        });
      }
      if (opts?.skipBalances) {
        log.debug("enrich:balances:skipped", { sinceStart: Date.now() - t0 });
      }
      try {
        const tPostStart = Date.now();
        if (enriched?.balanceData?.length) {
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
      await clearAuthData();
      setUser(null);
      setIsSignedIn(false);
      setBalancesLoading(false);
      providerReset();
      try { setAuthMethodState(null); } catch {}
    } finally {
      setIsLoading(false);
    }
  }, [
    clearAuthData,
    providerReset,
    setBalancesLoading,
    setIsLoading,
    setIsSignedIn,
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

  const signInWithWallet = useCallback(
    async (walletAddress: string, chainId: number) => {
      const mask = (addr?: string) =>
        addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : undefined;
      log.info("signInWithWallet:start", {
        walletAddress: mask(walletAddress),
        chainId,
      });
      setIsLoading(true);
      try {
        // capture override provider BEFORE any flow clears it
        const preOverride = getSigningProvider();
        const hasOverride = !!preOverride;
        // Persist the chosen auth method up-front; clear if the login fails
        try {
          const methodNow = (hasOverride ? "local" : "web3auth");
          await setAuthMethod(methodNow, walletAddress);
          try { setAuthMethodState(methodNow); } catch {}
        } catch {}
        let privateKey: string | undefined;
        if (!hasOverride) {
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
            hasOverride ? undefined : { privateKey }
          );
          walletUser = (res as any).user;
          token = (res as any).token;
          needsUsername = !!(res as any).needsUsername;
        } catch (e) {
          try {
            await clearAuthMethod();
          } catch {}
          try { setAuthMethodState(null); } catch {}
          throw e;
        }
        try {
          // prefer the captured override even if a later read is cleared
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
            skipBalances: true, // skip on first load; fetch in background with loading state
          });
          await persistLocalAccountIfPossible(enriched);
          try {
            setBalancesLoading(true);
          } catch {}
          try {
            fetchAndStoreBalances(enriched).catch(() => {});
          } catch {}
        }
      } finally {
        setIsLoading(false);
      }
    },
    [
      adoptProvider,
      enrichAndStoreUser,
      ensureProvider,
      fetchAndStoreBalances,
      getSigningProvider,
      log,
      setChainId,
      setIsFirstTimeUser,
      setIsLoading,
      setIsSignedIn,
      setNeedsUsername,
      setProvisionalToken,
      setProvisionalUser,
    ]
  );

  const completeUsername = useCallback(
    (finalUser: User) => {
      setIsSignedIn(true);
      setIsFirstTimeUser(false);
      setNeedsUsername(false);
      setProvisionalUser(null);
      setProvisionalToken(null);
      enrichAndStoreUser(finalUser, { refetch: true, skipBalances: true })
        .then(async (u) => {
          await persistLocalAccountIfPossible(u);
          try {
            setBalancesLoading(true);
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
      });
      // Also refresh on-chain balances as part of a manual refresh
      try { setBalancesLoading(true); } catch {}
      try { await fetchAndStoreBalances(updated); } catch {}
    },
    [enrichAndStoreUser, fetchAndStoreBalances, setBalancesLoading]
  );

  return {
    signInWithWallet,
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
