import { setupAAProvider } from './smart-account';
import { ChainId } from '../../config/constants';
import { createLocalEip1193ProviderForChain } from '../../services/localwallet.provider';
import { AuthService } from '../../services';
import { getSupabaseAuthMeta } from '../../services/auth/supabaseAuth.service';
import { getPreferredChainId } from '../auth.utils';
import { provisionSolanaAddressForWallet } from '../identity-wallet';
import { setSigningProvider, setEoaSigningProvider, clearSigningProvider } from '../provider.registry';
import { completeWalletReplacement } from './replacement';
import { currentIdentity, removeProfilesForAddress } from '../profiles';
import i18n from 'i18next';

/** Resume profile rotation with a recovered replacement key after a restart. */
export async function finishWalletReplacement(
  ownerAddress: string,
  privateKey: string,
  signInWithWallet: (address: string, chainId: number, privateKey: string, meta?: Record<string, any>) => Promise<unknown>,
): Promise<void> {
  const chainId = (await getPreferredChainId()) ?? ChainId.BASE_MAINNET;
  const provider = await setupAAProvider(ownerAddress, privateKey, chainId);
  const accounts = provider && await provider.request({ method: 'eth_accounts' }) as string[];
  if (!provider || !accounts?.[0]) throw new Error(i18n.t('walletSetup.couldNotStartOver'));
  setSigningProvider(provider);
  setEoaSigningProvider(createLocalEip1193ProviderForChain(privateKey, chainId));
  // The address being rotated away from, read before sign-in replaces it.
  const previous = await currentIdentity();
  try {
    await AuthService.rotateWalletForReplacement(accounts[0], chainId);
    const meta = await getSupabaseAuthMeta();
    await provisionSolanaAddressForWallet(ownerAddress, privateKey);
    await signInWithWallet(accounts[0], chainId, privateKey, meta);
    await completeWalletReplacement(ownerAddress);
    // Its saved "Continue as" row now points at an address with no profile.
    if (previous && previous.address.toLowerCase() !== accounts[0].toLowerCase()) {
      await removeProfilesForAddress(previous.address, (await currentIdentity())?.id);
    }
  } finally {
    clearSigningProvider();
  }
}
