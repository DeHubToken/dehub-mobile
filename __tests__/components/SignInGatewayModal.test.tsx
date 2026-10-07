import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SignInGatewayModal from '../../components/auth/SignInGatewayModal';
import { useAuthActions, useAuthState } from '../../context/AuthContext';

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
jest.mock('../../components/auth/LegacyAccountWarningModal', () => 'LegacyWarning');
jest.mock('../../components/FullScreenLoader', () => 'Loader');
jest.mock('../../hooks/useWalletAuth', () => ({ useWalletAuth: () => ({ isWalletLoading: false, isWalletSheetOpen: false }) }));
jest.mock('../../hooks/useScrollFieldIntoView', () => ({ useScrollFieldIntoView: () => ({ scrollViewProps: {} }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }), Trans: 'Trans' }));
jest.mock('../../config/constants', () => ({ ChainId: { BASE_MAINNET: 8453 } }));
jest.mock('../../libs/links.utils', () => ({}));
jest.mock('../../libs/auth.utils', () => ({}));
jest.mock('../../services/auth/supabaseAuth.service', () => ({}));
jest.mock('../../libs/identity-wallet', () => ({}));
jest.mock('../../libs/provision-and-sign-in', () => ({}));
jest.mock('../../libs/wallet-setup-intent', () => ({}));
jest.mock('../../libs/wallet-core/crypto', () => ({}));
jest.mock('../../libs/wallet-core/store', () => ({}));
jest.mock('../../libs/wallet-core/replacement', () => ({}));
jest.mock('../../libs/wallet-core/derive', () => ({}));
jest.mock('../../libs/wallet-core/assert-wallet-address', () => ({}));
jest.mock('../../services/localwallet.provider', () => ({}));
jest.mock('../../libs/provider.registry', () => ({}));
jest.mock('../../libs/wallet-core/smart-account', () => ({}));
jest.mock('../../services', () => ({}));

it('keeps the same native sheet open through signup and locks backdrop dismissal', () => {
  const completeUsername = jest.fn();
  const signOut = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  (useAuthActions as jest.Mock).mockReturnValue({ completeUsername, signOut });
  (useAuthState as jest.Mock).mockReturnValue({ needsUsername: false, isLoading: false });
  const screen = render(<SignInGatewayModal visible onClose={onClose} />);
  const sheet = screen.UNSAFE_getByType('NativeSheet' as any);
  expect(sheet.props.visible).toBe(true);
  expect(screen.UNSAFE_queryAllByType('SocialLogin' as any)).toHaveLength(1);

  const provisionalUser = { address: 'new-account' };
  (useAuthState as jest.Mock).mockReturnValue({ needsUsername: true, provisionalUser, isLoading: false });
  screen.rerender(<SignInGatewayModal visible onClose={onClose} />);
  expect(screen.UNSAFE_getByType('NativeSheet' as any)).toBe(sheet);
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.dismissible).toBe(false);
  expect(screen.UNSAFE_queryAllByType('SocialLogin' as any)).toHaveLength(0);
  const form = screen.UNSAFE_getByType('ProfileForm' as any);
  expect(form.props.provisionalUser).toBe(provisionalUser);
  const finalUser = { ...provisionalUser, username: 'newuser' };
  fireEvent(form, 'complete', finalUser);
  expect(completeUsername).toHaveBeenCalledWith(finalUser);
  fireEvent(form, 'signOut');
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});
