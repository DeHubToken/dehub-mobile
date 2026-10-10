import { useQueries, useQuery } from '@tanstack/react-query';
import { useUser, useAuthState } from '../context/AuthContext';
import { getCachedSolanaAddress } from '../libs/identity-wallet';
import { readWalletTokens, WALLET_CHAINS } from '../libs/wallet-tokens';
import { getTokenPrices } from '../libs/dhbPrice';
import { readWithTimeout } from '../libs/dex-read-timeout';

export function useWalletTokens() {
  const user = useUser();
  const { isSignedIn } = useAuthState();
  const address = user?.walletAddress || user?.address || '';
  const solana = useQuery({
    queryKey: ['wallet-solana-address', address],
    queryFn: () => getCachedSolanaAddress(address),
    enabled: isSignedIn && !!address, staleTime: 60_000, retry: false,
  });
  const queries = useQueries({ queries: WALLET_CHAINS.map(chain => {
    const owner = chain.id === 101 ? solana.data : address;
    return {
      queryKey: ['wallet-tokens', owner, chain.id],
      queryFn: () => readWalletTokens(owner!, chain.id),
      enabled: isSignedIn && !!owner, staleTime: 60_000, retry: false,
    };
  }) });
  const prices = useQuery({
    queryKey: ['wallet-token-prices'], queryFn: () => readWithTimeout(getTokenPrices(), 'Prices'),
    enabled: isSignedIn, staleTime: 60_000, retry: false,
  });
  return {
    address, solanaAddress: solana.data || null, prices: prices.data || {},
    tokens: isSignedIn && address ? queries.flatMap(query => query.data || []) : [],
    loading: queries.some(query => query.isLoading),
    refreshing: queries.some(query => query.isFetching),
    failedChains: WALLET_CHAINS.filter((_, index) => queries[index].isError || queries[index].data?.some(token => token.balance === null || token.incomplete)),
    refresh: () => Promise.all([solana.refetch(), prices.refetch(), ...queries.filter((_, i) => WALLET_CHAINS[i].id !== 101 || !!solana.data).map(query => query.refetch())]),
  };
}
