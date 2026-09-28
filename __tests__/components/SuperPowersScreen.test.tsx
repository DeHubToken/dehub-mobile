import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SuperPowersScreen from '../../screens/SuperPowersScreen';

let mockStatus: any;
let mockPurchases = false;
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', ScrollView: 'ScrollView', Pressable: 'Pressable',
  ActivityIndicator: 'ActivityIndicator', Image: 'Image',
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) }));
jest.mock('../../theme', () => ({ theme: { colors: { accent: '#fff' } } }));
jest.mock('../../libs', () => ({ badgeImage: () => null, toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../context/AuthContext', () => ({ useUser: () => ({ address: '0xgranted' }) }));
jest.mock('../../config/storefront', () => ({ get DIGITAL_PURCHASES_ENABLED() { return mockPurchases; } }));
jest.mock('../../hooks/useSuperpowers', () => ({
  useSuperpowers: () => ({ data: mockStatus, isLoading: false, refetch: jest.fn() }),
  useSuperpowerLadder: () => ({ data: { powers: [
    { key: 'team_up', label: 'Team up', available: true, tier: null },
  ], tiers: [] }, isLoading: false }),
  useCancelBoost: () => ({ mutate: jest.fn() }),
}));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ScreenHeader', () => 'ScreenHeader');
jest.mock('../../components/Badge/BadgeProgress', () => ({ BadgeProgress: () => null }));
jest.mock('../../components/common/SuperPowerIcon', () => 'SuperPowerIcon');
jest.mock('../../components/ui/GlassModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../../components/common/SpendPowerSheet', () => {
  const element = require('react').createElement;
  return { __esModule: true, default: ({ power }: any) => power ? element('Text', { testID: 'spend-power' }, power.key) : null };
});
jest.mock('../../components/common/TeamUpSheet', () => {
  const element = require('react').createElement;
  return { __esModule: true, default: ({ visible }: any) => visible ? element('Text', { testID: 'team-up' }, 'Team up open') : null };
});
jest.mock('../../components/Dpay/BuyDhbSheet', () => {
  const element = require('react').createElement;
  return { __esModule: true, default: () => element('Text', { testID: 'token-purchase' }, 'Token purchase') };
});

beforeEach(() => { mockStatus = undefined; mockPurchases = false; });

it('lets a granted badge spend its server allowance without an iOS purchase control', () => {
  mockStatus = { tier: 'Crab', badgeBalance: 0, boostsLeft: 2, bookings: [], powers: [
    { key: 'boost', label: 'Boost', summary: 'Boost a post', tier: 'Crab', unlocked: true, available: true },
  ] };
  const view = render(<SuperPowersScreen />);
  fireEvent.press(view.getByText('Boost'));
  expect(view.getByTestId('spend-power').props.children).toBe('boost');
  expect(view.queryByText('superpowers.getDhb')).toBeNull();
  expect(view.queryByTestId('token-purchase')).toBeNull();
});

it('keeps Team up accessible without a badge or a purchase', () => {
  const view = render(<SuperPowersScreen />);
  fireEvent.press(view.getByText('Team up'));
  expect(view.getByTestId('team-up')).toBeTruthy();
  expect(view.queryByText('superpowers.getDhb')).toBeNull();
  expect(view.queryByTestId('token-purchase')).toBeNull();
});

it('retains the optional token purchase on platforms where it is enabled', () => {
  mockPurchases = true;
  const view = render(<SuperPowersScreen />);
  expect(view.getByText('superpowers.getDhb')).toBeTruthy();
  expect(view.getByTestId('token-purchase')).toBeTruthy();
});
