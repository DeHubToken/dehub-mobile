import { useCallback } from "react";

import type { User } from "../context/AuthContext"; // only for type reference
import { defaultChainId } from "../config/constants";

type Logger = { debug: (...a: any[]) => void; warn: (...a: any[]) => void };

type UseBalancesParams = {
  log: Logger;
  setBalancesLoading: (v: boolean) => void;
  setUser: (updater: (prev: User | null) => User | null) => void;
  isMountedRef: { current: boolean };
  setAuthUser: (u: User) => Promise<void>;
  // Provide a getter to always read the latest active chainId from provider lifecycle
  getChainId?: () => number | undefined;
};

export function useBalances({ log, setBalancesLoading, setUser, isMountedRef, setAuthUser, getChainId }: UseBalancesParams) {
  const fetchAndStoreBalances = useCallback(async (u: User) => {
    if (!isMountedRef.current) return;
    try {
      setBalancesLoading(true);
      const addr = u?.walletAddress || u?.address;
      if (!addr) return;
      // Use active provider chainId when available; fallback to app default
      const activeChainId = (typeof getChainId === "function" ? getChainId() : undefined) ?? defaultChainId;
      const symbols = ["DHB", "USDC", "USDT", "WETH"];
      const t0 = Date.now();
      log.debug("balances:bg:start", { addr, symbols, chainId: activeChainId });
      const { ethersService } = await import("../services/ethers.service");
      const balances = await ethersService.getTokenBalances(addr, activeChainId, symbols);
      if (!isMountedRef.current) return;
      setUser((prev) => {
        const merged: User | null = prev
          ? ({ ...(prev as User), tokenBalances: { ...((prev as User)?.tokenBalances || {}), ...balances } } as User)
          : prev;
        if (merged) setAuthUser(merged).catch(() => {});
        return merged;
      });
      log.debug("balances:bg:done", { addr, chainId: activeChainId, ms: Date.now() - t0 });
    } catch (e) {
      log.warn("balances:bg:error", e);
    } finally {
      if (isMountedRef.current) setBalancesLoading(false);
    }
  }, [getChainId, isMountedRef, log, setAuthUser, setBalancesLoading, setUser]);

  return { fetchAndStoreBalances };
}
