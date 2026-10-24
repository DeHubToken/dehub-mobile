import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import SocialLoginIcons from '../../components/auth/SocialLoginIcons';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));
jest.mock('../../config/reown.config', () => ({ isWalletConnectAvailable: true }));
jest.mock('../../services/auth/passkeyAuth.service', () => ({ isPasskeyLoginAvailable: () => true }));
jest.mock('../../components/auth/ImportWalletModal', () => () => null);
jest.mock('../../components/auth/EmailLoginFlow', () => () => {
  const { Text } = require('react-native');
  return <Text>Email form</Text>;
});
jest.mock('../../components/auth/PhoneLoginFlow', () => () => {
  const { Text } = require('react-native');
  return <Text>Phone form</Text>;
});
jest.mock('../../components/auth/PasskeyLoginFlow', () => () => {
  const { Text } = require('react-native');
  return <Text>Fingerprint choices</Text>;
});

it('replaces the email form when selecting another method and keeps provider choices available', () => {
  jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
  const view = render(<SocialLoginIcons layout="stack" onGoogle={jest.fn()} onApple={jest.fn()} onPhoneSubmit={jest.fn()} onEmailSubmit={jest.fn()} onPasskeySignIn={jest.fn()} onPasskeySignUp={jest.fn()} />);
  expect(view.getByText('Email form')).toBeTruthy();

  fireEvent.press(view.getByRole('button', { name: 'loginStack.phone' }));
  expect(view.queryByText('Email form')).toBeNull();
  expect(view.getByText('Phone form')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Google' })).toBeTruthy();

  fireEvent.press(view.getByRole('button', { name: 'loginStack.fingerprint' }));
  expect(view.queryByText('Phone form')).toBeNull();
  expect(view.getByText('Fingerprint choices')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Google' })).toBeTruthy();

  fireEvent.press(view.getByRole('button', { name: 'loginModal.continueEmail' }));
  expect(view.getByText('Email form')).toBeTruthy();
  expect(view.queryByText('Fingerprint choices')).toBeNull();
  jest.restoreAllMocks();
});
