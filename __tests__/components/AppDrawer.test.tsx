import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AppDrawer from '../../components/Home/AppDrawer';

const mockDispatch = jest.fn();
let mockSignedIn = true;
let mockBalance = 500;
let mockDigitalPurchasesEnabled = true;
const mockOpenLink = jest.fn();
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
// The system theme, without the native modules the real provider loads.
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({ isMinimal: false, isLight: false, colors: jest.requireActual('../../theme/colors').systemColors }),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', Image: 'Image',
  Platform: { OS: 'android' },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
  Keyboard: { dismiss: jest.fn() },
  I18nManager: { isRTL: false },
}));
jest.mock('@react-navigation/native', () => ({
  CommonActions: { navigate: (payload: unknown) => ({ type: 'NAVIGATE', payload }) },
  useNavigation: () => ({ dispatch: mockDispatch }),
  useNavigationState: (select: (state: unknown) => unknown) => select({ index: 0, routes: [
    { name: 'App', state: { index: 0, routes: [{ name: 'Root', state: { index: 0, routes: [{ name: 'DM' }] } }] } },
  ] }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: () => {
    const gesture: Record<string, unknown> = {};
    ['activeOffsetY', 'failOffsetX', 'onStart', 'onUpdate', 'onEnd', 'onFinalize'].forEach(key => { gesture[key] = () => gesture; });
    return gesture;
  } },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'View' },
  useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: () => ({}),
  withTiming: (value: unknown) => value, runOnJS: (fn: unknown) => fn,
  Easing: { bezier: jest.fn() }, interpolate: jest.fn(),
}));
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../config/storefront', () => ({ get DIGITAL_PURCHASES_ENABLED() { return mockDigitalPurchasesEnabled; } }));
jest.mock('../../context/AuthContext', () => ({
  useAuthState: () => ({ isSignedIn: mockSignedIn }),
  useAuthActions: () => ({ signOut: jest.fn() }),
  useUser: () => mockSignedIn ? { username: 'member', address: '0xmember', followers: 3, followings: 2, ownBadgeBalance: mockBalance } : null,
}));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '' }));
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock('../../libs/links.utils', () => ({ openInApp: (url: string) => mockOpenLink(url) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const destinations = [
  ['nav.profile', 'Profile'], ['nav.explore', 'Explore', true],
  ['nav.prompt', 'Prompt'], ['nav.notifications', 'Notifications'], ['nav.messages', 'DM', true],
  ['nav.communities', 'Communities'], ['nav.assistant', 'AIChat', true], ['nav.settings', 'AccountSettings'],
  ['nav.leaderboard', 'Leaderboard'], ['nav.stats', 'Stats'], ['nav.bookmarks', 'MyLibrary', false, { initialTab: 'saved' }],
  ['nav.command', 'CommandCentre'], ['nav.wallet', 'Dpay', false, { initialTab: 'buy' }],
  ['nav.events', 'Events'], ['nav.stages', 'Stages'], ['nav.featureRequests', 'FeatureRequests'],
  ['nav.staking', 'Dpay', false, { initialTab: 'stake' }], ['nav.superpowers', 'SuperPowers'],
  ['nav.governance', 'Governance'], ['nav.dao', 'Dao'], ['screens.work', 'Work'],
  ['nav.affiliate', 'Affiliate'], ['nav.careers', 'Careers'], ['screens.stores', 'Stores'], ['screens.usernames', 'Usernames'], ['nav.fractions', 'Fractions'], ['screens.accounts', 'Accounts'],
  ['nav.agents', 'Agents'], ['nav.ads', 'Ads'], ['nav.tv', 'TV'], ['nav.arcade', 'Arcade'],
  ['nav.converter', 'Converter'], ['nav.migrate', 'Migrate'], ['nav.glossary', 'Glossary'], ['nav.guide', 'Guide'],
  ['nav.connectAi', 'Connect'],
] as const;

beforeEach(() => { jest.clearAllMocks(); mockSignedIn = true; mockBalance = 500; mockDigitalPurchasesEnabled = true; });

it.each([['nav.superpowers', 'SuperPowers'], ['nav.arcade', 'Arcade'], ['nav.governance', 'Governance']])(
  'keeps %s accessible with no token balance and iOS purchases disabled', (label, screen) => {
    mockDigitalPurchasesEnabled = false;
    mockBalance = 0;
    const view = render(<AppDrawer visible onClose={jest.fn()} />);
    expect(view.queryByLabelText('nav.wallet')).toBeNull();
    fireEvent.press(view.getByLabelText(label));
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: {
      name: 'App', params: { screen, params: undefined },
    } });
  },
);

it.each(destinations)('%s immediately closes and targets its registered nested screen', (label, screen, tab = false, params = undefined) => {
  const close = jest.fn();
  const view = render(<AppDrawer visible onClose={close} />);
  fireEvent.press(view.getByLabelText(label));
  expect(close).toHaveBeenCalledTimes(1);
  expect(Keyboard.dismiss).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledTimes(1);
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: {
    name: 'App', params: tab ? { screen: 'Root', params: { screen, params } } : { screen, params },
  } });
  const navigator = readFileSync(resolve(__dirname, '../../navigation', tab ? 'BottomTabNavigator.tsx' : 'AppNavigator.tsx'), 'utf8');
  expect(navigator).toContain(`name={ScreenNames.${screen}}`);
});

it('routes the profile header, balance chip, and Post through App', () => {
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  fireEvent.press(view.getByText('member'));
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Profile', params: undefined } } });
  fireEvent.press(view.getByLabelText('nav.wallet 500'));
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Dpay', params: { initialTab: 'buy' } } } });
  fireEvent.press(view.getByLabelText('sidebar.post'));
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Upload', params: undefined } } });
});

it('hides the balance chip when the wallet holds no DHB', () => {
  mockBalance = 0;
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  expect(view.queryByLabelText('nav.wallet 0')).toBeNull();
});

it('routes sign-in through App and hides protected entries when signed out', () => {
  mockSignedIn = false;
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  expect(view.queryByLabelText('nav.profile')).toBeNull();
  expect(view.queryByLabelText('nav.messages')).toBeNull();
  fireEvent.press(view.getByText('screens.signIn'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'SignIn', params: undefined } } });
});

it('searches Explore with the menu query and opens documentation links', () => {
  const close = jest.fn();
  const view = render(<AppDrawer visible onClose={close} />);
  for (const label of ['nav.docs', 'nav.blog']) fireEvent.press(view.getByLabelText(label));
  expect(mockOpenLink.mock.calls.map(call => call[0])).toEqual([expect.stringMatching(/\/docs$/), expect.stringMatching(/\/docs\/blog$/)]);
  fireEvent.changeText(view.getByLabelText('sidebar.searchMenu'), 'hello');
  fireEvent(view.getByLabelText('sidebar.searchMenu'), 'submitEditing');
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Root', params: {
    screen: 'Explore', params: { q: 'hello', ts: expect.any(Number) },
  } } } });
});

it('leaves Home and the feed tabs off the resting menu but finds Home by search', () => {
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  for (const label of ['nav.home', 'feed.videos', 'feed.images', 'feed.music', 'feed.live']) expect(view.queryByLabelText(label)).toBeNull();
  fireEvent.changeText(view.getByLabelText('sidebar.searchMenu'), 'nav.home');
  fireEvent.press(view.getByLabelText('nav.home'));
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Root', params: { screen: 'Home', params: undefined } } } });
});
