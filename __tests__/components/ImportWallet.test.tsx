import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ImportWallet from '../../components/auth/ImportWallet';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', StyleSheet: { flatten: (style: unknown) => style || {} } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/auth/AuthControls', () => ({
  AuthButton: 'AuthButton', AuthDivider: 'AuthDivider', AuthTextButton: 'AuthTextButton',
}));
jest.mock('../../components/auth/ImportWalletModal', () => 'WalletImportForm');

const labels = (view: ReturnType<typeof render>, type: string) =>
  view.UNSAFE_queryAllByType(type as any).map(node => node.props.label as string);

it('opens the wallet form directly', () => {
  const view = render(<ImportWallet />);
  const wallet = view.UNSAFE_getAllByType('AuthButton' as any).find(button => button.props.label === 'auth.importWallet')!;
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(false);
  fireEvent(wallet, 'press');
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(true);
  fireEvent(view.UNSAFE_getByType('WalletImportForm' as any), 'close');
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(false);
});

it('uses a supplied direct-import navigation callback', () => {
  const onImport = jest.fn();
  const view = render(<ImportWallet onImport={onImport} />);
  const wallet = view.UNSAFE_getAllByType('AuthButton' as any).find(button => button.props.label === 'auth.importWallet')!;
  fireEvent(wallet, 'press');
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(false);
});

// The old-account migration is gone from sign-in: support moves those accounts.
it.each(['buttons', 'links'] as const)('offers no account migration (%s)', (variant) => {
  const view = render(<ImportWallet variant={variant} />);
  const offered = [...labels(view, 'AuthButton'), ...labels(view, 'AuthTextButton')];
  expect(offered).toContain('auth.importWallet');
  expect(offered.filter(label => /migrat/i.test(label))).toEqual([]);
});
