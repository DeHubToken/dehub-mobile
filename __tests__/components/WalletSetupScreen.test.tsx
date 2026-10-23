import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import WalletSetupScreen from '../../components/auth/WalletSetupScreen';
import { isBiometricUnlockAvailable } from '../../libs/wallet-core/biometric-unlock';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Touchable',
  ActivityIndicator: 'Spinner', StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }), Trans: 'Trans' }));
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: 'NativeSheet' }));
jest.mock('../../components/auth/PasswordStrengthMeter', () => 'StrengthMeter');
jest.mock('../../components/auth/RecoveryPhrase', () => ({
  RecoveryPhraseCheck: 'PhraseCheck', RecoveryPhraseGrid: 'PhraseGrid', RecoveryPhraseWarnings: 'PhraseWarnings',
}));
jest.mock('../../components/auth/AuthControls', () => ({
  AUTH_RADIUS: 12, AuthButton: 'Button', AuthDivider: 'Divider', AuthErrorNotice: 'Error', AuthField: 'Field',
  AuthIconButton: 'IconButton', AuthTextButton: 'TextButton', authColors: {}, authText: {},
}));
jest.mock('../../libs/wallet-core/backup-status', () => ({ markBackedUp: jest.fn() }));
jest.mock('../../libs/wallet-core/passwordStrength', () => ({
  assessLocal: jest.fn(() => null), assessPassword: jest.fn(), MIN_PASSWORD_LENGTH: 12,
}));
jest.mock('../../libs/wallet-core/biometric-unlock', () => ({
  isBiometricUnlockAvailable: jest.fn(), hasBiometricWrapKey: jest.fn(),
}));
jest.mock('../../libs/biometric-gate', () => ({ BiometricRejectedError: class extends Error {}, requireDeviceOwner: jest.fn() }));
jest.mock('../../libs/wallet-core/store', () => ({ probeOtherSeedCopies: jest.fn() }));
jest.mock('../../libs/wallet-core/derive', () => ({ isRawPrivateKey: jest.fn(), isValidMnemonic: jest.fn() }));
jest.mock('../../libs/links.utils', () => ({ openInApp: jest.fn() }));
jest.mock('../../config/links', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) }));
jest.mock('../../libs/wallet-core/crypto', () => ({ getPayloadKdf: jest.fn() }));
jest.mock('../../hooks/useSecureScreen', () => ({ useSecureScreen: jest.fn() }));

const request = { mode: 'create' as const, supabaseUserId: 'apple-user' };

function renderSheet(onCreate = jest.fn().mockResolvedValue(undefined), onClose = jest.fn()) {
  return render(
    <WalletSetupScreen
      visible
      request={request}
      onClose={onClose}
      onUnlock={jest.fn()}
      onBiometricUnlock={jest.fn()}
      onCreate={onCreate}
      onCreateConfirmed={jest.fn().mockResolvedValue(undefined)}
    />,
  );
}

const buttonLabelled = (screen: ReturnType<typeof render>, label: string) =>
  screen.UNSAFE_getAllByType('Button' as any).find((b) => b.props.label === label);

it('offers the device key on a device with no biometrics or passcode', async () => {
  (isBiometricUnlockAvailable as jest.Mock).mockResolvedValue(false);
  const onCreate = jest.fn().mockResolvedValue(undefined);
  const screen = renderSheet(onCreate);
  await waitFor(() => expect(buttonLabelled(screen, 'walletSetup.secureOnDevice')).toBeDefined());

  const tabLabels = screen.UNSAFE_getAllByType('Touchable' as any)
    .map((tab) => tab.findByType('Text' as any).props.children);
  expect(tabLabels).toEqual(['walletSetup.deviceTab', 'walletSetup.password']);
  // The device key is preselected: no password form to fight first.
  expect(screen.UNSAFE_queryAllByType('Field' as any)).toHaveLength(0);

  await act(async () => {
    await buttonLabelled(screen, 'walletSetup.secureOnDevice')!.props.onPress();
  });
  expect(onCreate).toHaveBeenCalledWith({ kind: 'biometric' });
});

it('keeps biometric wording where a fingerprint or face is enrolled', async () => {
  (isBiometricUnlockAvailable as jest.Mock).mockResolvedValue(true);
  const screen = renderSheet();
  await waitFor(() => expect(buttonLabelled(screen, 'walletSetup.secureWithBiometrics')).toBeDefined());
  expect(buttonLabelled(screen, 'walletSetup.secureOnDevice')).toBeUndefined();
});

it('does not let a stray dismiss drop a new sign-in back at the login screen', async () => {
  (isBiometricUnlockAvailable as jest.Mock).mockResolvedValue(false);
  const onCreate = jest.fn().mockResolvedValue({ recoveryPhrase: 'twelve words', address: '0xabc' });
  const onClose = jest.fn();
  const screen = renderSheet(onCreate, onClose);
  await waitFor(() => expect(buttonLabelled(screen, 'walletSetup.secureOnDevice')).toBeDefined());
  expect(screen.UNSAFE_getByType('NativeSheet' as any).props.dismissible).toBe(false);

  // Cancel stays the explicit way out.
  const cancel = screen.UNSAFE_getAllByType('TextButton' as any).find((b) => b.props.label === 'common.cancel');
  expect(cancel).toBeDefined();

  // Once the wallet is saved, a dismiss is "Skip for now" and may close.
  await act(async () => {
    await buttonLabelled(screen, 'walletSetup.secureOnDevice')!.props.onPress();
  });
  expect(screen.UNSAFE_getByType('NativeSheet' as any).props.dismissible).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
});
