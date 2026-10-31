/**
 * Decides, once per wallet, which chain the app starts on. Renders nothing.
 * New wallets start on BNB Chain; a wallet already holding tokens on Base
 * keeps Base (libs/defaultChain). The Base read stops once decided.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '../../context/AuthContext';
import { readWalletTokens } from '../../libs/wallet-tokens';
import {
  BASE_CHAIN, decideDefaultChain, getDecidedDefaultChain, loadDefaultChains, setDefaultChainWallet,
} from '../../libs/defaultChain';

export default function DefaultChainSync() {
  const user = useUser();
  const wallet = (user?.walletAddress || user?.address || null) as string | null;
  const [ready, setReady] = useState(false);

  useEffect(() => { loadDefaultChains().then(() => setReady(true)); }, []);
  useEffect(() => { setDefaultChainWallet(wallet); }, [wallet]);

  const undecided = ready && !!wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) && !getDecidedDefaultChain(wallet);
  const { data } = useQuery({
    queryKey: ['default-chain-base-read', wallet?.toLowerCase()],
    queryFn: () => readWalletTokens(wallet!, BASE_CHAIN),
    enabled: undecided,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (wallet && data && undecided) decideDefaultChain(wallet, data);
  }, [wallet, data, undecided]);

  return null;
}
