import React from 'react';
import { render } from '@testing-library/react-native';
import { interpolate } from 'react-native-reanimated';
import AppDrawer from '../../components/Home/AppDrawer';

// Under a right-to-left locale React Native mirrors `left: 0` to the right
// edge, so the drawer lives on the right of the screen. Closed, it has to be
// parked off the RIGHT edge; parking it off the left (the LTR offset) leaves
// the last 18% of it painted down the left side of every screen.
const SCREEN_WIDTH = 390;
const DRAWER_WIDTH = SCREEN_WIDTH * 0.82;

const mockHandlers: Record<string, (e: Record<string, number>) => void> = {};
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
// The system theme, without the native modules the real provider loads.
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({ isMinimal: false, isLight: false, colors: jest.requireActual('../../theme/colors').systemColors }),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  Platform: { OS: 'android' },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s, absoluteFill: {} },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
  Keyboard: { dismiss: jest.fn() },
  I18nManager: { isRTL: true },
}));
jest.mock('@react-navigation/native', () => ({
  CommonActions: { navigate: (payload: unknown) => ({ type: 'NAVIGATE', payload }) },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useNavigationState: () => 'Home',
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: () => {
    const gesture: Record<string, unknown> = {};
    ['activeOffsetX', 'failOffsetY'].forEach(key => { gesture[key] = () => gesture; });
    ['onStart', 'onUpdate', 'onEnd', 'onFinalize'].forEach(key => {
      gesture[key] = (fn: (e: Record<string, number>) => void) => { mockHandlers[key] = fn; return gesture; };
    });
    return gesture;
  } },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'View' },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (factory: () => unknown) => factory(),
  withTiming: (value: unknown) => value, runOnJS: (fn: unknown) => fn,
  Easing: { bezier: jest.fn() }, interpolate: jest.fn(() => 0),
}));
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../context/AuthContext', () => ({
  useAuthState: () => ({ isSignedIn: false }),
  useAuthActions: () => ({ signOut: jest.fn() }),
  useUser: () => null,
}));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '' }));
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock('../../libs/links.utils', () => ({ openInApp: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => { jest.clearAllMocks(); });

it('parks the closed drawer off the right edge, not the left', () => {
  render(<AppDrawer visible={false} onClose={jest.fn()} />);
  expect(interpolate).toHaveBeenCalledWith(expect.anything(), [0, 1], [DRAWER_WIDTH, 0]);
  expect(interpolate).not.toHaveBeenCalledWith(expect.anything(), [0, 1], [-DRAWER_WIDTH, 0]);
});

it('closes on a drag toward the right edge and ignores one away from it', () => {
  const close = jest.fn();
  render(<AppDrawer visible onClose={close} />);

  // Halfway toward the right edge and released: past the position threshold.
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationX: DRAWER_WIDTH / 2 });
  mockHandlers.onEnd({ velocityX: 0 });
  expect(close).toHaveBeenCalledTimes(1);

  // Dragged left, away from the edge (into the screen): stays open.
  close.mockClear();
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationX: -DRAWER_WIDTH / 2 });
  mockHandlers.onEnd({ velocityX: 0 });
  expect(close).not.toHaveBeenCalled();

  // A fling toward the right edge closes even from fully open.
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationX: 0 });
  mockHandlers.onEnd({ velocityX: 1000 });
  expect(close).toHaveBeenCalledTimes(1);

  // A fling to the left is the LTR close gesture and must not close here.
  close.mockClear();
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationX: 0 });
  mockHandlers.onEnd({ velocityX: -1000 });
  expect(close).not.toHaveBeenCalled();
});
