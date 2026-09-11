import { provisionAndSignIn, type ProvisionDeps } from '../../libs/provision-and-sign-in';
import { resolveEvmWalletForIdentity, releaseWalletKeyForSignIn } from '../../libs/identity-wallet';
import { fetchWalletReliably } from '../../libs/wallet-core/store';

jest.mock('../../config/constants', () => ({ ChainId: { BASE_MAINNET: 8453 } }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }));
jest.mock('../../libs/auth.utils', () => ({
  getPreferredChainId: jest.fn(), getAuthToken: jest.fn(), getAuthUser: jest.fn(),
  clearAuthData: jest.fn(), setStoredSupabaseUserId: jest.fn(), getStoredSupabaseUserId: jest.fn(),
}));
jest.mock('../../libs/identity-wallet', () => ({
  resolveEvmWalletForIdentity: jest.fn(), getKnownWalletAddress: jest.fn(),
  forgetLocalWalletForIdentity: jest.fn(), releaseWalletKeyForSignIn: jest.fn(),
  retryPendingResetCleanup: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../libs/profiles', () => ({ stageIncomingIdentity: jest.fn() }));
jest.mock('../../libs/wallet-core/store', () => ({ fetchWallet: jest.fn(), fetchWalletReliably: jest.fn() }));
jest.mock('../../libs/wallet-core/legacy-detect', () => ({ checkLegacyAccount: jest.fn() }));
jest.mock('../../services/auth/supabaseAuth.service', () => ({ getSupabaseUserId: jest.fn().mockResolvedValue('uid') }));

const address = '0x1111111111111111111111111111111111111111';
const locked = { status: 'needs-web-passkey-sync' as const, address };
let deps: ProvisionDeps;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(resolveEvmWalletForIdentity).mockResolvedValue(locked);
  deps = {
    getSupabaseAccessToken: jest.fn().mockResolvedValue('token'),
    signInWithSupabaseSession: jest.fn().mockResolvedValue('linked'),
    completeLocalSignIn: jest.fn(), getSupabaseAuthMeta: jest.fn(),
    provisionSolanaAddressForWallet: jest.fn(),
  };
});

it('signs in a passkey-only identity with its wallet locked', async () => {
  await expect(provisionAndSignIn('uid', deps)).resolves.toEqual({ kind: 'signed-in' });
  expect(deps.signInWithSupabaseSession).toHaveBeenCalledWith('token', 8453, address, 'uid', { allowLocked: true });
  expect(releaseWalletKeyForSignIn).not.toHaveBeenCalled();
  expect(deps.completeLocalSignIn).not.toHaveBeenCalled();
});
it.each(['not-linked', 'failed'])('does not bypass a refused exchange (%s)', async (outcome) => {
  jest.mocked(deps.signInWithSupabaseSession).mockResolvedValue(outcome as 'not-linked' | 'failed');
  const result = await provisionAndSignIn('uid', deps);
  expect(result.kind).toBe('wallet-setup');
  expect(deps.completeLocalSignIn).not.toHaveBeenCalled();
});
it('uses the same locked path after a transient lookup failure', async () => {
  jest.mocked(resolveEvmWalletForIdentity).mockResolvedValueOnce({ status: 'wallet-lookup-failed' });
  await expect(provisionAndSignIn('uid', deps)).resolves.toEqual({ kind: 'signed-in' });
  expect(deps.signInWithSupabaseSession).toHaveBeenCalledWith('token', 8453, address, 'uid', { allowLocked: true });
});
it('uses the same locked path when a cloud row appears on retry', async () => {
  jest.mocked(resolveEvmWalletForIdentity).mockResolvedValueOnce({ status: 'needs-create-password' });
  jest.mocked(fetchWalletReliably).mockResolvedValue({ wallet: { ethAddress: address, payload: null }, failed: false });
  await expect(provisionAndSignIn('uid', deps)).resolves.toEqual({ kind: 'signed-in' });
  expect(deps.signInWithSupabaseSession).toHaveBeenCalledWith('token', 8453, address, 'uid', { allowLocked: true });
});
it('does not sign in without an identity token', async () => {
  jest.mocked(deps.getSupabaseAccessToken).mockResolvedValue(null);
  expect((await provisionAndSignIn('uid', deps)).kind).toBe('wallet-setup');
  expect(deps.signInWithSupabaseSession).not.toHaveBeenCalled();
});
