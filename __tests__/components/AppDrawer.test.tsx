import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AppDrawer from '../../components/Home/AppDrawer';

const mockDispatch = jest.fn();
let mockSignedIn = true;
const mockOpenLink = jest.fn();
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  Platform: { OS: 'android' },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
  Keyboard: { dismiss: jest.fn() },
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
    ['activeOffsetX', 'failOffsetY', 'onStart', 'onUpdate', 'onEnd', 'onFinalize'].forEach(key => { gesture[key] = () => gesture; });
    return gesture;
  } },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'View' },
  useSharedValue: (value: unknown) => ({ value }), useAnimatedStyle: () => ({}),
  withTiming: (value: unknown) => value, runOnJS: (fn: unknown) => fn,
  Easing: { bezier: jest.fn() }, interpolate: jest.fn(),
}));
jest.mock('expo-blur', () => ({ BlurView: 'View' }));
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../context/AuthContext', () => ({
  useAuthState: () => ({ isSignedIn: mockSignedIn }),
  useAuthActions: () => ({ signOut: jest.fn() }),
  useUser: () => mockSignedIn ? { username: 'member', address: '0xmember', followers: 3, followings: 2 } : null,
}));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '' }));
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock('../../libs/links.utils', () => ({ openInApp: (url: string) => mockOpenLink(url) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const destinations = [
  ['nav.home', 'Home', true], ['nav.profile', 'Profile'], ['nav.explore', 'Explore', true],
  ['nav.prompt', 'Prompt'], ['nav.notifications', 'Notifications'], ['nav.messages', 'DM', true],
  ['nav.communities', 'Communities'], ['nav.assistant', 'AIChat', true], ['nav.settings', 'AccountSettings'],
  ['nav.leaderboard', 'Leaderboard'], ['nav.stats', 'Stats'], ['nav.bookmarks', 'MyLibrary'],
  ['nav.command', 'CommandCentre'], ['nav.wallet', 'Dpay', false, { initialTab: 'buy' }],
  ['nav.events', 'Events'], ['nav.stages', 'Stages'], ['nav.featureRequests', 'FeatureRequests'],
  ['nav.staking', 'Dpay', false, { initialTab: 'stake' }], ['nav.superpowers', 'SuperPowers'],
  ['nav.governance', 'Governance'], ['nav.dao', 'Dao'], ['screens.work', 'Work'],
  ['nav.affiliate', 'Affiliate'], ['nav.careers', 'Careers'], ['screens.stores', 'Stores'],
  ['nav.ads', 'Ads'], ['nav.tv', 'TV'], ['nav.arcade', 'Arcade'], ['nav.glossary', 'Glossary'], ['nav.guide', 'Guide'],
] as const;

beforeEach(() => { jest.clearAllMocks(); mockSignedIn = true; });

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

it('routes the profile header, follower tabs, and Post through App', () => {
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  fireEvent.press(view.getByText('member'));
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Profile', params: undefined } } });
  for (const tab of ['following', 'followers']) {
    fireEvent.press(view.getByText(` ${'profile.' + tab}`));
    expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'FollowList', params: {
      address: '0xmember', username: 'member', initialTab: tab, isOwnProfile: true,
    } } } });
  }
  fireEvent.press(view.getByLabelText('sidebar.post'));
  expect(mockDispatch).toHaveBeenLastCalledWith({ type: 'NAVIGATE', payload: { name: 'App', params: { screen: 'Upload', params: undefined } } });
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
