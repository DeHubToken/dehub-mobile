import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PremiumScreen from '../../screens/PremiumScreen';
import RaffleScreen from '../../screens/RaffleScreen';
import BuilderScreen from '../../screens/BuilderScreen';

const mockNavigate = jest.fn();
const mockKeyboardOffset = jest.fn((..._args: unknown[]) => 24);
// A guest: requireAuth holds the action for after sign-in instead of running it.
let mockPending: Array<() => void> = [];
const mockRequireAuth = jest.fn((action: () => void) => { mockPending.push(action); });

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Pressable: 'Pressable', ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
  Platform: { OS: 'android' },
  UIManager: {},
  LayoutAnimation: { configureNext: jest.fn(), Presets: {} },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/LiquidGlass', () => 'LiquidGlass');
jest.mock('../../components/ScreenHeader', () => ({ __esModule: true, default: 'ScreenHeader', SCREEN_HEADER_HEIGHT: 108 }));
jest.mock('../../components/page/PageKit', () => {
  const h = require('react').createElement;
  return {
    PageSection: ({ children }: any) => h('View', null, children),
    PageEmpty: ({ title, body, action }: any) => h('View', null, h('Text', null, title), body ? h('Text', null, body) : null, action),
    KitButton: ({ label, onPress, disabled }: any) => h('Pressable', { onPress, disabled, accessibilityRole: 'button' }, h('Text', null, label)),
    PageTabs: () => null,
    ThemeIcon: () => null,
    useFlatPage: () => true,
  };
});
jest.mock('../../hooks/useKeyboardLayout', () => ({ useKeyboardOffset: (...args: unknown[]) => mockKeyboardOffset(...args) }));
jest.mock('../../hooks/useWebCheckout', () => ({
  useWebCheckout: () => ({ canBuy: false, checking: false, opening: null, openCheckout: jest.fn() }),
}));
jest.mock('../../context/AuthContext', () => ({ useAuthActions: () => ({ requireAuth: mockRequireAuth }) }));
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../config/links', () => ({ WEBSITE_LINK: 'https://dehub.io' }));
jest.mock('../../libs/links.utils', () => ({ openInApp: jest.fn() }));

const STAKE = ['Dpay', { initialTab: 'stake' }];

beforeEach(() => {
  jest.clearAllMocks();
  mockPending = [];
});

/** The tap went through sign-in, not straight to the signed-in-only wallet route. */
function expectSignInThenStake() {
  expect(mockRequireAuth).toHaveBeenCalledTimes(1);
  expect(mockNavigate).not.toHaveBeenCalled();
  mockPending.forEach(action => action());
  expect(mockNavigate).toHaveBeenCalledWith(...STAKE);
}

describe('staking buttons for guests', () => {
  it('Premium: both staking links ask a guest to sign in first', () => {
    for (const label of ['premium.itsOnUs', 'premium.viewStakingTiers']) {
      jest.clearAllMocks();
      mockPending = [];
      const screen = render(<PremiumScreen />);
      fireEvent.press(screen.getByText(label));
      expectSignInThenStake();
      screen.unmount();
    }
  });

  it('Raffle: the stake card asks a guest to sign in, the public cards do not', () => {
    const screen = render(<RaffleScreen />);
    const [stake, arcade, stages] = screen.getAllByText('raffle.open');

    fireEvent.press(stake);
    expectSignInThenStake();

    jest.clearAllMocks();
    fireEvent.press(arcade);
    fireEvent.press(stages);
    expect(mockRequireAuth).not.toHaveBeenCalled();
    expect(mockNavigate.mock.calls).toEqual([['Arcade'], ['Stages']]);
  });

  it('Raffle: going to the feed returns to the existing tabs instead of stacking another copy', () => {
    const screen = render(<RaffleScreen />);
    fireEvent.press(screen.getByText('raffle.findLiveDraw'));
    expect(mockNavigate).toHaveBeenCalledWith('Root', { screen: 'Home' }, { pop: true });
  });

  it('Builder: the allowance link asks a guest to sign in first', () => {
    const screen = render(<BuilderScreen />);
    fireEvent.press(screen.getByText('builder.stakeForAllowance'));
    expectSignInThenStake();
  });

  it('Builder: the keyboard offset does not count the header twice', () => {
    render(<BuilderScreen />);
    expect(mockKeyboardOffset.mock.calls[0]).toEqual([]);
  });
});
