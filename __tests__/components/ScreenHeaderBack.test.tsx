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
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../../components/AppTopBar', () => ({ __esModule: true, default: 'AppTopBar', APP_TOP_BAR_HEIGHT: 48 }));
jest.mock('../../context/ThemeContext', () => ({ useAppTheme: () => ({ isMinimal: false }) }));
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

const backButtons = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === 'common.goBack' && typeof node.type === 'string');

const emit = (event: string) => act(() => (mockListeners[event] ?? []).forEach((cb) => cb()));

beforeEach(() => {
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
