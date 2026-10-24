import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SocialLoginIcons from '../../components/auth/SocialLoginIcons';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => {
  const { createElement: element } = require('react');
  return {
    View: 'View', Text: 'Text', TextInput: 'TextInput', ScrollView: 'ScrollView', Switch: 'Switch', ActivityIndicator: 'ActivityIndicator',
    Pressable: ({ children, style, ...props }: any) => element('View', { ...props, accessible: true, style: typeof style === 'function' ? style({ pressed: false }) : style }, children),
    Keyboard: { dismiss: jest.fn() },
    StyleSheet: { create: (styles: unknown) => styles, flatten: (styles: any) => Array.isArray(styles) ? Object.assign({}, ...styles) : styles },
  };
});
jest.mock('../../components/auth/AuthControls', () => {
  const { createElement: element } = require('react');
  const Button = ({ label, onPress }: any) => element('View', { accessible: true, accessibilityRole: 'button', accessibilityLabel: label, onPress }, element('Text', null, label));
  return { AuthButton: Button, AuthTextButton: Button, authColors: { label: '#fff' }, AUTH_DISABLED_OPACITY: 0.45, AUTH_CONTROL_HEIGHT: 56, AUTH_RADIUS: 12 };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-svg', () => ({ SvgXml: () => null }));
jest.mock('../../config/reown.config', () => ({ isWalletConnectAvailable: true }));
jest.mock('../../services/auth/passkeyAuth.service', () => ({ isPasskeyLoginAvailable: () => true }));
jest.mock('../../components/auth/ImportWalletModal', () => () => null);
jest.mock('../../components/auth/EmailLoginFlow', () => () => {
  const { createElement: element } = require('react');
  const { Text } = require('react-native');
  return element(Text, null, 'Email form');
});
jest.mock('../../components/auth/PhoneLoginFlow', () => () => {
  const { createElement: element } = require('react');
  const { Text } = require('react-native');
  return element(Text, null, 'Phone form');
});
jest.mock('../../components/auth/PasskeyLoginFlow', () => () => {
  const { createElement: element } = require('react');
  const { Text } = require('react-native');
  return element(Text, null, 'Fingerprint choices');
});

it('replaces the email form when selecting another method and keeps provider choices available', () => {
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
});
