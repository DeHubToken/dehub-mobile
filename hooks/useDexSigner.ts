import { useCallback, useRef } from 'react';
import { useAuthActions, useProvider } from '../context/AuthContext';
import { getSigningProvider } from '../libs/provider.registry';
import { prepareWalletForQueuedMint } from '../libs/wallet-signing-preflight';
import { readWithTimeout } from '../libs/dex-read-timeout';

/**
 * The signing provider for a DEX action on `chainId`: unlocks the wallet, moves
 * it to that chain when it is elsewhere, and hands back the provider to sign with.
 * The same sequence the DHB book runs before every mint and withdrawal.
 */
export function useDexSigner() {
  const { chainId: connectedChain, provider: sessionProvider } = useProvider();
  const { switchChain } = useAuthActions();
  const state = useRef({ connectedChain, sessionProvider, switchChain });
  state.current = { connectedChain, sessionProvider, switchChain };
  return useCallback(async (chainId: number, unlockMessage: string) => {
    const { connectedChain: current, sessionProvider: session, switchChain: switchTo } = state.current;
    await prepareWalletForQueuedMint(getSigningProvider() || session);
    if (current !== chainId) await readWithTimeout(Promise.resolve(switchTo(chainId)), 'Wallet network', 60000);
    const provider = getSigningProvider() || state.current.sessionProvider;
    if (!provider) throw new Error(unlockMessage);
    return provider;
  }, []);
}
