import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ImportWallet from '../../components/auth/ImportWallet';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/auth/AuthControls', () => ({ AuthButton: 'AuthButton', AuthDivider: 'AuthDivider' }));
jest.mock('../../components/auth/ImportWalletModal', () => 'WalletImportForm');
jest.mock('../../components/auth/MigrateAccountModal', () => 'AccountMigrationForm');

it('opens the wallet form directly and keeps account migration separate', () => {
  const view = render(<ImportWallet />);
  const buttons = view.UNSAFE_getAllByType('AuthButton' as any);
  const wallet = buttons.find(button => button.props.label === 'auth.importWallet')!;
  const account = buttons.find(button => button.props.label === 'auth.migrateAccount')!;
  fireEvent(wallet, 'press');
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(true);
  expect(view.UNSAFE_getByType('AccountMigrationForm' as any).props.visible).toBe(false);
  fireEvent(view.UNSAFE_getByType('WalletImportForm' as any), 'close');
  fireEvent(account, 'press');
  expect(view.UNSAFE_getByType('WalletImportForm' as any).props.visible).toBe(false);
  expect(view.UNSAFE_getByType('AccountMigrationForm' as any).props.visible).toBe(true);
});

it('uses a supplied direct-import navigation callback without opening migration', () => {
  const onImport = jest.fn();
  const view = render(<ImportWallet onImport={onImport} />);
  const wallet = view.UNSAFE_getAllByType('AuthButton' as any).find(button => button.props.label === 'auth.importWallet')!;
  fireEvent(wallet, 'press');
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(view.UNSAFE_getByType('AccountMigrationForm' as any).props.visible).toBe(false);
});
