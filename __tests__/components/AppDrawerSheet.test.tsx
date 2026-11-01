import { storage as draftStorage } from '../../libs/storage';
import { __resetDraftCacheForTests } from '../../libs/draft-cache';
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { getThemeSkin, glassTint } from '../../theme/skins';
import { APP_THEMES, type AppThemeName } from '../../theme/colors';
import FrostedPill from '../../components/ui/FrostedPill';
import { interpolate } from 'react-native-reanimated';
import AppDrawer from '../../components/Home/AppDrawer';

// The menu is a bottom sheet in every locale: parked below the screen when
// closed, dismissed by dragging or flinging it down. RTL is on here to prove
// the mirroring that the old side drawer needed no longer applies.
const SHEET_HEIGHT = 844 * 0.85;

const mockHandlers: Record<string, (e: Record<string, number>) => void> = {};
let mockTheme: AppThemeName = 'system';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
// Exercise every theme without the native modules the real provider loads.
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({
    theme: mockTheme,
    skin: jest.requireActual('../../theme/skins').getThemeSkin(mockTheme),
    isMinimal: mockTheme === 'minimal',
    isLight: false,
    colors: jest.requireActual('../../theme/colors').systemColors,
  }),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView', Image: 'Image',
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
jest.mock('../../components/common/Reorder', () => ({
  ReorderItem: ({ children }: { children: React.ReactNode }) => children,
  useReorder: ({ ids }: { ids: string[] }) => ({ order: ids, draggingId: null, scrollRef: undefined, onViewportLayout: undefined, ctx: {} }),
  justDropped: () => false,
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true, default: { View: 'View', ScrollView: 'ScrollView' },
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (factory: () => unknown) => factory(),
  withTiming: (value: unknown) => value, runOnJS: (fn: unknown) => fn,
  Easing: { bezier: jest.fn() }, interpolate: jest.fn(() => 0),
}));
jest.mock('../../components/common/Avatar', () => 'Avatar');
jest.mock('expo-image', () => ({ Image: 'Image' }));
jest.mock('../../components/ui/Icon', () => 'Icon');
jest.mock('../../components/ui/FrostedPill', () => 'FrostedPill');
jest.mock('../../components/theme/HudBrackets', () => 'HudBrackets');
jest.mock('../../components/ui/SheetGlass', () => ({ __esModule: true, default: 'SheetGlass', SheetGlassFill: 'SheetGlassFill' }));
let mockBackdropBlur: 'android' | 'ios' | null = null;
const mockBackdropActive: boolean[] = [];
jest.mock('../../components/ui/SheetBackdrop', () => ({
  __esModule: true, default: 'SheetBackdrop',
  useSheetBackdrop: (active: boolean) => {
    mockBackdropActive.push(active);
    const blur = active ? mockBackdropBlur : null;
    return { blur, blurred: !!blur, scrim: 'rgba(0,0,0,0.3)', light: false };
  },
}));
jest.mock('../../config/storefront', () => ({ DIGITAL_PURCHASES_ENABLED: true }));
jest.mock('../../context/AuthContext', () => ({
  useAuthState: () => ({ isSignedIn: false }),
  useAuthActions: () => ({ signOut: jest.fn() }),
  useUser: () => null,
}));
jest.mock('../../libs/misc', () => ({ getAvatarUrl: () => '', getBadgeUrlFor: () => undefined, getBadgeHoverOpticalStyle: () => ({}) }));
jest.mock('../../libs', () => ({ toastError: jest.fn(), toastInfo: jest.fn() }));
jest.mock('../../libs/links.utils', () => ({ openInApp: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockTheme = 'system';
  Platform.OS = 'android';
  mockBackdropBlur = null;
  mockBackdropActive.length = 0;
});

it.each(APP_THEMES)(
  'opens %s with glass, the shared backdrop and no elevation shadow', (theme) => {
    mockTheme = theme;
    const close = jest.fn();
    const view = render(<AppDrawer visible onClose={close} />);
    const sheetStyle = Object.assign({}, ...view.getByTestId('app-menu-sheet').props.style.filter(Boolean));
    expect(sheetStyle).toMatchObject({ backgroundColor: 'transparent', elevation: 0, overflow: 'hidden' });
    expect(view.UNSAFE_getByType(FrostedPill).props.tint).toBe(glassTint(getThemeSkin(theme)?.page ?? '#0B0B0E', 0.18));
    // The dismiss target paints nothing itself; the shared backdrop inside it
    // carries the blur and the scrim.
    const dismiss = view.getByLabelText('common.close');
    expect(Object.assign({}, ...dismiss.props.style)).toMatchObject({ backgroundColor: 'transparent' });
    expect(view.UNSAFE_getByType('SheetBackdrop' as any)).toBeTruthy();
    fireEvent.press(dismiss);
    expect(close).toHaveBeenCalledTimes(1);
  },
);

it('takes the drawer wash instead of a second feed blur when the backdrop blurs', () => {
  mockBackdropBlur = 'android';
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  expect(view.UNSAFE_queryByType(FrostedPill)).toBeNull();
  expect(view.UNSAFE_getByType('SheetGlassFill' as any).props.backdropBlurred).toBe(true);
});

it('does not keep a backdrop blur alive behind the closed menu', () => {
  render(<AppDrawer visible={false} onClose={jest.fn()} />);
  expect(mockBackdropActive.every(active => !active)).toBe(true);
});

it('preserves the iOS menu surface', () => {
  Platform.OS = 'ios';
  const view = render(<AppDrawer visible onClose={jest.fn()} />);
  expect(view.UNSAFE_queryByType(FrostedPill)).toBeNull();
  expect(Object.assign({}, ...view.getByTestId('app-menu-sheet').props.style.filter(Boolean)))
    .toMatchObject({ backgroundColor: '#0B0B0E', elevation: 12 });
});

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
