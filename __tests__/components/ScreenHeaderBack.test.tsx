import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  Keyboard: { dismiss: jest.fn() },
  I18nManager: { isRTL: false },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../components/ui/ChromeSurface', () => () => null);
jest.mock('../../components/ui/NavPillSurface', () => 'NavPillSurface');
// The page pill draws the home pill's material; count it as the island.
jest.mock('../../components/ui/FeedPillSurface', () => ({
  FEED_PILL_RADIUS: 12,
  FeedPillSurface: 'NavPillSurface',
  FeedPillBrackets: () => null,
  FeedPillIndicator: () => null,
}));
jest.mock('../../components/ui/FrostedPill', () => ({ __esModule: true, default: 'FrostedPill', LIGHT_PILL_SHADOW: {} }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'AnimatedView' },
  Easing: { bezier: () => () => 0 },
  useReducedMotion: () => false,
  useSharedValue: (value: number) => ({ value }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: number) => value,
  withSpring: (value: number) => value,
  withDelay: (_ms: number, value: number) => value,
}));
jest.mock('@react-navigation/core', () => ({ NavigationContext: require('react').createContext(undefined) }));
jest.mock('../../theme/icons', () => ({ themeIconUrl: () => undefined }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: jest.fn(() => ({ isMinimal: false, theme: 'system' })) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const mockListeners: Record<string, Array<() => void>> = {};
const mockNavigation = {
  canGoBack: jest.fn(),
  getState: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn((event: string, cb: () => void) => {
    (mockListeners[event] ??= []).push(cb);
    return () => {};
  }),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

import ScreenHeader from '../../components/ScreenHeader';
import { APP_THEMES } from '../../theme/colors';
import { PageHeaderContext } from '../../components/page/PageHeaderContext';

it.each(APP_THEMES)('puts page tabs inside the pill and search in a drawer under it in %s', (theme) => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ theme, isMinimal: theme === 'minimal' });
  const TabProbe = () => <span data-in-header={React.useContext(PageHeaderContext)} />;
  const SearchProbe = () => <input data-in-header={React.useContext(PageHeaderContext)} />;
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Accounts" tabs={<TabProbe />}><SearchProbe /></ScreenHeader>); });
  expect(tree.root.findByType('span').props['data-in-header']).toBe(true);
  // The search waits behind the pill's search button until it is pressed.
  expect(tree.root.findAllByType('input')).toHaveLength(0);
  const pill = tree.root.findAllByType('NavPillSurface' as any)[0].parent!;
  expect(pill.findAllByType('span')).toHaveLength(1);
  const button = tree.root.find((node) => node.props.testID === 'pill-search-button' && typeof node.props.onPress === 'function');
  act(() => { button.props.onPress(); });
  expect(tree.root.findByType('input').props['data-in-header']).toBe(true);
  expect(pill.findAllByType('input')).toHaveLength(0);
  const drawer = tree.root.findAll((node) => node.props.testID === 'pill-search-drawer')[0];
  expect(drawer.findAllByType('input')).toHaveLength(1);
  act(() => tree.unmount());
});

it('draws the page title on one line, with no subtitle under it', () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Work" subtitle="Find paid tasks" />); });
  const texts = tree.root.findAll((node) => typeof node.props.children === 'string' && node.props.children === 'Find paid tasks');
  expect(texts).toHaveLength(0);
  act(() => tree.unmount());
});

const backButtons = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === 'common.goBack' && typeof node.type === 'string');

const emit = (event: string) => act(() => (mockListeners[event] ?? []).forEach((cb) => cb()));

beforeEach(() => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ isMinimal: false, theme: 'system' });
  Object.keys(mockListeners).forEach((k) => delete mockListeners[k]);
  mockNavigation.canGoBack.mockReset();
  mockNavigation.getState.mockReset();
  mockNavigation.getState.mockReturnValue({ type: 'stack', index: 0 });
});

// A freshly pushed screen can read a stack that does not include it yet on its
// first render. A page with nothing to load never renders again, so the arrow
// has to come from a read after mount, not from that first one.
it('shows the back arrow once the pushed screen is in the stack, even if it never re-renders', () => {
  mockNavigation.canGoBack.mockReturnValueOnce(false).mockReturnValue(true);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Careers" />); });
  expect(backButtons(tree)).toHaveLength(1);
  act(() => tree.unmount());
});

it('counts the render-time stack when canGoBack() has not caught up yet', () => {
  mockNavigation.canGoBack.mockReturnValue(false);
  mockNavigation.getState.mockReturnValue({ type: 'stack', index: 1 });
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Careers" />); });
  expect(backButtons(tree)).toHaveLength(1);
  act(() => tree.unmount());
});

it('re-reads on focus and on stack changes, and hides the arrow at the root', () => {
  mockNavigation.canGoBack.mockReturnValue(false);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Home" />); });
  expect(backButtons(tree)).toHaveLength(0);
  mockNavigation.canGoBack.mockReturnValue(true);
  emit('focus');
  expect(backButtons(tree)).toHaveLength(1);
  mockNavigation.canGoBack.mockReturnValue(false);
  emit('state');
  expect(backButtons(tree)).toHaveLength(0);
  act(() => tree.unmount());
});

it('keeps canGoBack={false} and onBackPress overrides', () => {
  mockNavigation.canGoBack.mockReturnValue(true);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Root" canGoBack={false} />); });
  expect(backButtons(tree)).toHaveLength(0);
  mockNavigation.canGoBack.mockReturnValue(false);
  act(() => tree.update(<ScreenHeader title="Sheet" onBackPress={() => {}} />));
  expect(backButtons(tree)).toHaveLength(1);
  act(() => tree.unmount());
});

it('shows only floating controls in System and keeps the profile menu usable', () => {
  const onBack = jest.fn();
  const onMenu = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ScreenHeader
        title="Profile"
        overlay
        onBackPress={onBack}
        rightContent={<button onClick={onMenu}>Options</button>}
      />,
    );
  });
  expect(tree.root.findAllByType('Text' as any)).toHaveLength(0);
  act(() => backButtons(tree)[0].props.onPress());
  expect(onBack).toHaveBeenCalledTimes(1);
  act(() => tree.root.findByType('button').props.onClick());
  expect(onMenu).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('keeps the page title on ordinary System pages', () => {
  mockNavigation.canGoBack.mockReturnValue(true);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Careers" />); });
  expect(tree.root.findAllByType('Text' as any).map(node => node.props.children)).toContain('Careers');
  expect(backButtons(tree)).toHaveLength(1);
  act(() => tree.unmount());
});

it.each(APP_THEMES)('keeps a conversation identity and its actions visible in %s', (theme) => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ theme, isMinimal: theme === 'minimal' });
  const onBack = jest.fn();
  const onCall = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader appearance="flat" title="Alice" subtitle="@alice" onBackPress={onBack}
    leftContent={<span />} rightContent={<button onClick={onCall}>Call</button>} />); });
  const text = tree.root.findAllByType('Text' as any).map(node => node.props.children);
  expect(text).toContain('Alice');
  expect(text).toContain('@alice');
  expect(tree.root.findAllByType('span')).toHaveLength(1);
  expect(tree.root.findAllByType('NavPillSurface' as any)).toHaveLength(0);
  act(() => backButtons(tree)[0].props.onPress());
  act(() => tree.root.findByType('button').props.onClick());
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onCall).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it.each(APP_THEMES)('keeps the inbox title, search, and new-message action together in %s', (theme) => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ theme, isMinimal: theme === 'minimal' });
  const onNew = jest.fn();
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader appearance="island" canGoBack={false} title="Messages"
    rightContent={<button onClick={onNew}>New</button>}><input /></ScreenHeader>); });
  expect(tree.root.findAllByType('Text' as any).map(node => node.props.children)).toContain('Messages');
  // The search waits in a drawer under the pill, behind the pill's search button.
  expect(tree.root.findAllByType('input')).toHaveLength(0);
  const search = tree.root.find((node) => node.props.testID === 'pill-search-button' && typeof node.props.onPress === 'function');
  act(() => { search.props.onPress(); });
  expect(tree.root.findAllByType('input')).toHaveLength(1);
  // The pill and the drawer share the pill's material.
  expect(tree.root.findAllByType('NavPillSurface' as any)).toHaveLength(2);
  act(() => tree.root.findByType('button').props.onClick());
  expect(onNew).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it.each(APP_THEMES)('uses a title island by default for ordinary pages in %s', (theme) => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ theme, isMinimal: theme === 'minimal' });
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Leaderboard" canGoBack={false} />); });
  expect(tree.root.findAllByType('Text' as any).map(node => node.props.children)).toContain('Leaderboard');
  expect(tree.root.findAllByType('NavPillSurface' as any)).toHaveLength(1);
  act(() => tree.unmount());
});

it('keeps explicit media controls free of title and island chrome', () => {
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader appearance="controls" title="Post" onBackPress={() => {}} />); });
  expect(tree.root.findAllByType('Text' as any)).toHaveLength(0);
  expect(tree.root.findAllByType('NavPillSurface' as any)).toHaveLength(0);
  expect(backButtons(tree)).toHaveLength(1);
  act(() => tree.unmount());
});
