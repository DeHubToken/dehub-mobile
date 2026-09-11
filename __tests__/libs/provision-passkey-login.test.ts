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


it.each(['needs-unlock', 'needs-biometric-unlock', 'needs-web-passkey-sync', 'ready', 'wallet-lookup-failed'])(
  'opens the linked profile without touching wallet state (%s)', async (status) => {
    jest.mocked(resolveEvmWalletForIdentity).mockResolvedValue({ status, address } as any);
    await expect(provisionAndSignIn('uid', deps)).resolves.toEqual({ kind: 'signed-in' });
    expect(deps.signInWithSupabaseSession).toHaveBeenCalledWith('token', 8453, undefined, 'uid', { allowLocked: true });
    expect(resolveEvmWalletForIdentity).not.toHaveBeenCalled();
    expect(fetchWalletReliably).not.toHaveBeenCalled();
    expect(releaseWalletKeyForSignIn).not.toHaveBeenCalled();
    expect(deps.completeLocalSignIn).not.toHaveBeenCalled();
  },
);
it.each(['not-linked', 'failed'])('does not unlock or sign after a refused exchange (%s)', async (outcome) => {
  jest.mocked(deps.signInWithSupabaseSession).mockResolvedValue(outcome as 'not-linked' | 'failed');
  expect((await provisionAndSignIn('uid', deps)).kind).toBe('error');
  expect(releaseWalletKeyForSignIn).not.toHaveBeenCalled();
  expect(deps.completeLocalSignIn).not.toHaveBeenCalled();
});
it('does not read a ready wallet key after an unlinked response', async () => {
  jest.mocked(resolveEvmWalletForIdentity).mockResolvedValue({ status: 'ready', address });
  jest.mocked(deps.signInWithSupabaseSession).mockResolvedValue('not-linked');
  expect((await provisionAndSignIn('uid', deps)).kind).toBe('error');
  expect(releaseWalletKeyForSignIn).not.toHaveBeenCalled();
});
it('does not authenticate or provision without an identity token', async () => {
  jest.mocked(deps.getSupabaseAccessToken).mockResolvedValue(null);
  expect((await provisionAndSignIn('uid', deps)).kind).toBe('error');
  expect(deps.signInWithSupabaseSession).not.toHaveBeenCalled();
  expect(resolveEvmWalletForIdentity).not.toHaveBeenCalled();
});
