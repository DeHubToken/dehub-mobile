import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import LegacyAccountWarningModal from '../../components/auth/LegacyAccountWarningModal';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner',
  StyleSheet: { create: (styles: unknown) => styles },
}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: 'Sheet' }));
jest.mock('../../components/common/DhbCoin', () => ({ DhbCoin: 'Coin' }));
jest.mock('../../components/auth/AuthControls', () => ({
  AUTH_CONTROL_HEIGHT: 56, AUTH_RADIUS: 12,
  AuthButton: 'Button', AuthTextButton: 'TextButton', AuthField: 'Field', AuthErrorNotice: 'Error',
  authColors: {}, authText: {},
}));
jest.mock('../../config/links', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../libs/links.utils', () => ({ openInApp: jest.fn() }));
jest.mock('../../libs/logger', () => ({ createLogger: () => ({ warn: jest.fn(), error: jest.fn() }) }));
const mockStart = jest.fn();
jest.mock('../../libs/legacy-web3auth', () => ({ startLegacyMigration: (...a: unknown[]) => mockStart(...a) }));
jest.mock('../../libs/wallet-core/predict-safe-address', () => ({ predictSafeAddress: async () => '0xsafe-other' }));
jest.mock('../../libs/wallet.utils', () => ({ deriveAddressFromPrivateKey: () => '0xowner-other' }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: any) => {
      const vars = typeof opts === 'object' ? opts : {};
      return `${key}${Object.keys(vars).filter((k) => k !== 'defaultValue').map((k) => `|${k}=${vars[k]}`).join('')}`;
    },
  }),
}));

const thor = { username: 'thor', signupMethod: 'google', ethAddress: '0xthor' };
const labels = (screen: ReturnType<typeof render>) =>
  screen.UNSAFE_getAllByType('Button' as any).map((b) => b.props.label as string);

beforeEach(() => mockStart.mockReset());

// The recording: an email sign-in matched @thor, made with Google. The sheet
// offered every provider plus an email box, the person used the email box,
// and email can never open a Google-made wallet.
it('leads with the login the old profile was made with', () => {
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[thor]} email="me@gmail.com" onRecovered={jest.fn()} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  expect(labels(screen)).toEqual(['legacy.continueWith|provider=Google', 'legacy.recoverOnWebsite']);
  expect(screen.UNSAFE_queryAllByType('Field' as any)).toHaveLength(0);

  const other = screen.UNSAFE_getAllByType('TextButton' as any).find((b) => b.props.label === 'legacy.differentSignIn')!;
  act(() => other.props.onPress());
  // Brand names are never run through translation ("Apple" came back "Elma").
  expect(labels(screen)).toEqual(expect.arrayContaining([
    'legacy.tryProvider|provider=Apple',
    'legacy.tryProvider|provider=X (Twitter)',
    'legacy.tryProvider|provider=Discord',
  ]));
  expect(labels(screen).filter((l) => l.includes('Google'))).toHaveLength(1);
  expect(screen.UNSAFE_getAllByType('Field' as any).map((f) => f.props.value)).toEqual(['me@gmail.com', '']);
});

it('names the right login when a different one opens some other wallet', async () => {
  mockStart.mockResolvedValue('0xkey');
  const recovered = jest.fn();
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[thor]} email="me@gmail.com" onRecovered={recovered} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  const other = screen.UNSAFE_getAllByType('TextButton' as any).find((b) => b.props.label === 'legacy.differentSignIn')!;
  act(() => other.props.onPress());
  const recoverEmail = screen.UNSAFE_getAllByType('Button' as any).find((b) => b.props.accessibilityLabel === 'legacy.recoverFromEmailA11y')!;
  await act(async () => { await recoverEmail.props.onPress(); });
  expect(mockStart).toHaveBeenCalledWith('email_passwordless', 'me@gmail.com');
  expect(recovered).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType('Error' as any).props.message).toBe('legacy.wrongSignInNamed|name=thor|method=Google');
});

it('pre-fills the email when the old profile was made with an email code', () => {
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[{ ...thor, signupMethod: 'email_passwordless' }]} email="me@gmail.com" onRecovered={jest.fn()} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  const fields = screen.UNSAFE_getAllByType('Field' as any);
  expect(fields).toHaveLength(1);
  expect(fields[0].props.value).toBe('me@gmail.com');
});

it('refuses a phone number it would have to guess the country code for', async () => {
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[{ ...thor, signupMethod: 'sms_passwordless' }]} onRecovered={jest.fn()} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  const field = screen.UNSAFE_getByType('Field' as any);
  act(() => field.props.onChangeText('0532 123 4567'));
  const recover = screen.UNSAFE_getAllByType('Button' as any).find((b) => b.props.accessibilityLabel === 'legacy.recoverFromPhoneA11y')!;
  await act(async () => { await recover.props.onPress(); });
  expect(mockStart).not.toHaveBeenCalled();
  expect(screen.UNSAFE_getByType('Error' as any).props.message).toBe('legacy.phoneNeedsCode');

  act(() => screen.UNSAFE_getByType('Field' as any).props.onChangeText('+90 532 123 4567'));
  mockStart.mockRejectedValue(new Error('closed'));
  const again = screen.UNSAFE_getAllByType('Button' as any).find((b) => b.props.accessibilityLabel === 'legacy.recoverFromPhoneA11y')!;
  await act(async () => { await again.props.onPress(); });
  expect(mockStart).toHaveBeenCalledWith('sms_passwordless', '+90-5321234567');
});

it('lists every login when the original one was not recorded', () => {
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[{ ...thor, signupMethod: undefined }]} onRecovered={jest.fn()} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  expect(labels(screen).filter((l) => l.startsWith('legacy.tryProvider'))).toHaveLength(4);
  expect(screen.UNSAFE_getAllByType('Field' as any)).toHaveLength(2);
});

it('says nothing when the old login is closed without signing in', async () => {
  mockStart.mockRejectedValue(new Error('Login failed, login flow failed with error type dismiss'));
  const screen = render(
    <LegacyAccountWarningModal visible accounts={[thor]} onRecovered={jest.fn()} onCreateAnyway={jest.fn()} onClose={jest.fn()} />,
  );
  const google = screen.UNSAFE_getAllByType('Button' as any).find((b) => b.props.label === 'legacy.continueWith|provider=Google')!;
  await act(async () => { await google.props.onPress(); });
  expect(screen.UNSAFE_queryAllByType('Error' as any).filter((e) => e.props.message)).toHaveLength(0);
});
