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

const focusListeners: Array<() => void> = [];
const mockNavigation = {
  canGoBack: jest.fn(),
  goBack: jest.fn(),
  addListener: jest.fn((event: string, cb: () => void) => {
    if (event === 'focus') focusListeners.push(cb);
    return () => {};
  }),
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

import ScreenHeader from '../../components/ScreenHeader';

const backButtons = (tree: ReactTestRenderer) =>
  tree.root.findAll((node) => node.props.accessibilityLabel === 'common.goBack' && typeof node.type === 'string');

beforeEach(() => {
  focusListeners.length = 0;
  mockNavigation.canGoBack.mockReset();
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

it('re-reads on focus and hides the arrow at the root', () => {
  mockNavigation.canGoBack.mockReturnValue(false);
  let tree!: ReactTestRenderer;
  act(() => { tree = create(<ScreenHeader title="Home" />); });
  expect(backButtons(tree)).toHaveLength(0);
  mockNavigation.canGoBack.mockReturnValue(true);
  act(() => focusListeners.forEach((cb) => cb()));
  expect(backButtons(tree)).toHaveLength(1);
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
