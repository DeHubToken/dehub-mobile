import { storage as draftStorage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
import React from 'react';
import { render } from '@testing-library/react-native';
import { interpolate } from 'react-native-reanimated';
import AppDrawer from '../../components/Home/AppDrawer';

// The menu is a bottom sheet in every locale: parked below the screen when
// closed, dismissed by dragging or flinging it down. RTL is on here to prove
// the mirroring that the old side drawer needed no longer applies.
const SHEET_HEIGHT = 844 * 0.85;

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
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s, absoluteFill: {} },
  BackHandler: { addEventListener: () => ({ remove: jest.fn() }) },
  Keyboard: { dismiss: jest.fn() },
  I18nManager: { isRTL: true },
}));
jest.mock('@react-navigation/native', () => ({
  NavigationRouteContext: require('react').createContext(undefined),
  CommonActions: { navigate: (payload: unknown) => ({ type: 'NAVIGATE', payload }) },
  useNavigation: () => ({ dispatch: jest.fn() }),
  useNavigationState: () => 'Home',
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  Gesture: { Pan: () => {
    const gesture: Record<string, unknown> = {};
    ['activeOffsetY', 'failOffsetX'].forEach(key => { gesture[key] = () => gesture; });
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
jest.mock('expo-image', () => ({ Image: 'Image' }));
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

it('parks the closed sheet below the screen, not beside it', () => {
  render(<AppDrawer visible={false} onClose={jest.fn()} />);
  expect(interpolate).toHaveBeenCalledWith(expect.anything(), [0, 1], [SHEET_HEIGHT, 0]);
});

it('closes on a drag or fling down and ignores one up', () => {
  const close = jest.fn();
  render(<AppDrawer visible onClose={close} />);

  // Halfway down and released: past the position threshold.
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationY: SHEET_HEIGHT / 2 });
  mockHandlers.onEnd({ velocityY: 0 });
  expect(close).toHaveBeenCalledTimes(1);

  // Dragged up: stays open.
  close.mockClear();
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationY: -SHEET_HEIGHT / 2 });
  mockHandlers.onEnd({ velocityY: 0 });
  expect(close).not.toHaveBeenCalled();

  // A fling down closes even from fully open.
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationY: 0 });
  mockHandlers.onEnd({ velocityY: 1000 });
  expect(close).toHaveBeenCalledTimes(1);

  // A fling up does not.
  close.mockClear();
  mockHandlers.onStart({});
  mockHandlers.onUpdate({ translationY: 0 });
  mockHandlers.onEnd({ velocityY: -1000 });
  expect(close).not.toHaveBeenCalled();
});

beforeEach(() => { draftStorage.delete('dehub-drafts-v1'); __resetDraftCacheForTests(); });
