import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({
  View: 'View',
  Text: 'Text',
  TouchableOpacity: 'TouchableOpacity',
  Platform: { OS: 'android', select: (o: Record<string, unknown>) => o.android },
  Keyboard: { dismiss: jest.fn() },
  I18nManager: { isRTL: false },
  StyleSheet: { create: (styles: Record<string, unknown>) => styles, absoluteFill: {} },
}));
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../components/ui/ChromeSurface', () => () => null);
jest.mock('../../components/ui/NavPillSurface', () => 'NavPillSurface');
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

it.each(APP_THEMES)('groups page tabs and search inside the title island in %s', (theme) => {
  jest.requireMock('../../context/ThemeContext').useAppTheme.mockReturnValue({ theme, isMinimal: theme === 'minimal' });
  const TabProbe = () => <span data-in-header={React.useContext(PageHeaderContext)} />;
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Accounts" tabs={<TabProbe />}><input /></ScreenHeader>); });
  expect(tree.root.findByType('span').props['data-in-header']).toBe(true);
  const island = tree.root.findByType('NavPillSurface' as any).parent!;
  expect(island.findAllByType('span')).toHaveLength(1);
  expect(island.findAllByType('input')).toHaveLength(1);
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
  expect(tree.root.findAllByType('input')).toHaveLength(1);
  expect(tree.root.findAllByType('NavPillSurface' as any)).toHaveLength(1);
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
