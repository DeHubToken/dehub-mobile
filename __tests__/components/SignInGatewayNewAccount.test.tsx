/**
 * The email-code sign-in for a login the server has never seen, end to end
 * through the sign-in sheet and the real provisionAndSignIn: code accepted,
 * the server says not linked, the identity has no wallet row, so a new wallet
 * is made and signed in with. Nothing else may open in between. An email an
 * old account was once registered under used to land on that account's
 * recovery sheet at exactly this point.
 */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import SignInGatewayModal from '../../components/auth/SignInGatewayModal';
import { useAuthActions, useAuthState } from '../../context/AuthContext';
import { sendEmailOtp, verifyEmailOtp } from '../../services/auth/supabaseAuth.service';
import { createAndSaveEvmWalletForIdentity, resolveEvmWalletForIdentity } from '../../libs/identity-wallet';
import { fetchWalletReliably } from '../../libs/wallet-core/store';

const NEW_ADDRESS = '0x2222222222222222222222222222222222222222';
const NEW_KEY = '0xnewkey';
const mockAuthMeta = { verifier: 'dehub-supabase', verifierId: 'new-uid', email: 'new@example.com' };
const mockInvokeFunction = jest.fn();

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('../../context/AuthContext', () => ({ useAuthActions: jest.fn(), useAuthState: jest.fn() }));
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: 'NativeSheet' }));
jest.mock('../../components/auth/UsernameRequiredModal', () => ({ UsernameRequiredForm: 'ProfileForm' }));
jest.mock('../../components/auth/AuthControls', () => ({ AuthButton: 'Button', AuthErrorNotice: 'Error', authColors: {}, authText: {} }));
jest.mock('../../components/auth/SocialLoginIcons', () => 'SocialLogin');
jest.mock('../../components/auth/EmailCodeEntry', () => 'EmailCode');
jest.mock('../../components/auth/ImportWallet', () => 'ImportWallet');
jest.mock('../../components/auth/SignInSavedProfiles', () => 'SavedProfiles');
jest.mock('../../components/auth/WalletSetupScreen', () => 'WalletSetup');
jest.mock('../../components/FullScreenLoader', () => 'Loader');
jest.mock('../../hooks/useWalletAuth', () => ({ useWalletAuth: () => ({ isWalletLoading: false, isWalletSheetOpen: false }) }));
jest.mock('../../hooks/useScrollFieldIntoView', () => ({ useScrollFieldIntoView: () => ({ scrollViewProps: {} }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }), Trans: 'Trans' }));
jest.mock('../../config/constants', () => ({ ChainId: { BASE_MAINNET: 8453 } }));
jest.mock('../../libs/links.utils', () => ({}));
jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvokeFunction(...args) } },
}));
jest.mock('../../libs/auth.utils', () => ({
  getPreferredChainId: jest.fn().mockResolvedValue(null),
  getAuthToken: jest.fn().mockResolvedValue(null),
  getAuthUser: jest.fn().mockResolvedValue(null),
  clearAuthData: jest.fn(),
  setStoredSupabaseUserId: jest.fn().mockResolvedValue(undefined),
  getStoredSupabaseUserId: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../services/auth/supabaseAuth.service', () => ({
  sendEmailOtp: jest.fn().mockResolvedValue(undefined),
  verifyEmailOtp: jest.fn().mockResolvedValue('new-uid'),
  getSupabaseUserId: jest.fn().mockResolvedValue('new-uid'),
  getSupabaseAccessToken: jest.fn().mockResolvedValue('access-token'),
  getSupabaseAuthMeta: jest.fn(async () => mockAuthMeta),
}));
jest.mock('../../libs/identity-wallet', () => ({
  resolveEvmWalletForIdentity: jest.fn(),
  releaseWalletKeyForSignIn: jest.fn(),
  retryPendingResetCleanup: jest.fn().mockResolvedValue(undefined),
  createAndSaveEvmWalletForIdentity: jest.fn(),
  provisionSolanaAddressForWallet: jest.fn().mockResolvedValue('solana-address'),
}));
jest.mock('../../libs/wallet-core/store', () => ({ fetchWalletReliably: jest.fn() }));
jest.mock('../../libs/wallet-core/secure-offer', () => ({ markWalletSecureOffer: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../libs/profiles', () => ({ stageIncomingIdentity: jest.fn() }));
jest.mock('../../libs/wallet-core/replacement', () => ({
  getPendingWalletReplacement: jest.fn().mockResolvedValue(null),
  completeWalletReplacement: jest.fn(),
}));
jest.mock('../../libs/wallet-core/crypto', () => ({}));
jest.mock('../../libs/wallet-core/derive', () => ({}));
jest.mock('../../libs/wallet-core/assert-wallet-address', () => ({}));
jest.mock('../../services/localwallet.provider', () => ({ createLocalEip1193ProviderForChain: () => ({ request: jest.fn() }) }));
jest.mock('../../libs/provider.registry', () => ({
  setSigningProvider: jest.fn(), setEoaSigningProvider: jest.fn(), clearSigningProvider: jest.fn(),
}));
jest.mock('../../libs/wallet-core/smart-account', () => ({ setupAAProvider: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services', () => ({ AuthService: { rotateWalletForReplacement: jest.fn() } }));

it('takes a new email sign-in straight into a new wallet, with nothing in between', async () => {
  const signInWithWallet = jest.fn().mockResolvedValue(undefined);
  const signInWithSupabaseSession = jest.fn().mockResolvedValue('not-linked');
  (useAuthActions as jest.Mock).mockReturnValue({ signInWithWallet, signInWithSupabaseSession, completeUsername: jest.fn(), signOut: jest.fn() });
  (useAuthState as jest.Mock).mockReturnValue({ needsUsername: false, isLoading: false });
  jest.mocked(resolveEvmWalletForIdentity).mockResolvedValue({ status: 'needs-create-password' });
  jest.mocked(fetchWalletReliably).mockResolvedValue({ wallet: null, failed: false });
  jest.mocked(createAndSaveEvmWalletForIdentity).mockResolvedValue({ address: NEW_ADDRESS, privateKey: NEW_KEY, secret: 'words' });

  const screen = render(<SignInGatewayModal visible onClose={jest.fn()} />);
  await act(async () => {
    await screen.UNSAFE_getByType('SocialLogin' as any).props.onEmailSubmit('new@example.com');
  });
  expect(sendEmailOtp).toHaveBeenCalledWith('new@example.com');
  await act(async () => {
    await screen.UNSAFE_getByType('EmailCode' as any).props.onSubmit('123456');
  });

  expect(verifyEmailOtp).toHaveBeenCalledWith('new@example.com', '123456');
  expect(signInWithSupabaseSession).toHaveBeenCalledWith('access-token', 8453, undefined, 'new-uid', { allowLocked: true });
  expect(createAndSaveEvmWalletForIdentity).toHaveBeenCalledWith('new-uid', { kind: 'biometric' });
  expect(signInWithWallet).toHaveBeenCalledTimes(1);
  expect(signInWithWallet).toHaveBeenCalledWith(NEW_ADDRESS, 8453, NEW_KEY, mockAuthMeta);
  expect(mockInvokeFunction).not.toHaveBeenCalled();
  // The sign-in sheet is the only thing open: no wallet sheet, no other sheet,
  // and no error under the code field.
  const open = screen.UNSAFE_root
    .findAll((node) => typeof node.type === 'string' && node.props.visible === true)
    .map((node) => node.type);
  expect(open).toEqual(['NativeSheet']);
  expect(screen.UNSAFE_getByType('WalletSetup' as any).props.request).toBeNull();
  expect(screen.UNSAFE_getByType('Error' as any).props.message ?? null).toBeNull();
});
