import { useQuery } from "@tanstack/react-query";
import { useAuthState, useUser } from "../context/AuthContext";
import { DHB_ADDRESSESS } from "../config/constants";
import { coinKey, fetchTopUpCoins, readCoinBalances, type TopUpCoin } from "../libs/coinTopUp";

/** Creator prices are DHB at the peg, so DHB counts at $0.001 here too. */
const USD_PER_DHB = 0.001;

/**
 * Dollars this wallet can spend in the creator right now, without the Studio
 * balance (the caller adds it): DHB on Base and BNB Chain, plus USDT and USDC.
 */
export function useUsableWalletUsd(enabled = true) {
  const { isSignedIn } = useAuthState();
  const user = useUser();
  const address = (user?.walletAddress || user?.address)?.toLowerCase();
  return useQuery({
    queryKey: ["usable-usd", address ?? null],
    enabled: enabled && isSignedIn && !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const coins = await fetchTopUpCoins().catch(() => [] as TopUpCoin[]);
      const dhb: TopUpCoin[] = [8453, 56]
        .filter((chainId) => !!DHB_ADDRESSESS[chainId])
        .map((chainId) => ({ symbol: "USDT", chainId, address: DHB_ADDRESSESS[chainId], decimals: 18, priceUsd: USD_PER_DHB, treasuryAddress: "" }));
      const [coinBalances, dhbBalances] = await Promise.all([readCoinBalances(coins, address!), readCoinBalances(dhb, address!)]);
      const coinsUsd = coins.reduce((sum, c) => sum + (coinBalances[coinKey(c)] || 0) * c.priceUsd, 0);
      const dhbUnits = Object.values(dhbBalances).reduce<number>((sum, v) => sum + (v || 0), 0);
      return coinsUsd + dhbUnits * USD_PER_DHB;
    },
  });
}
