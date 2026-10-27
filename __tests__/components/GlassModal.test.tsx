import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PanResponder, ScrollView, View } from 'react-native';
import GlassModal from '../../components/ui/GlassModal';
import SheetDismissHandle from '../../components/ui/SheetDismissHandle';

jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
// The system theme, without the native modules the real provider loads.
jest.mock('../../context/ThemeContext', () => ({
  useAppTheme: () => ({ isMinimal: false, isLight: false, colors: jest.requireActual('../../theme/colors').systemColors }),
}));
jest.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput', Modal: 'Modal',
  TouchableOpacity: 'TouchableOpacity', ScrollView: 'ScrollView',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  Platform: { OS: 'ios' },
  StyleSheet: { create: (s: unknown) => s, flatten: (s: unknown) => s },
  Keyboard: { addListener: () => ({ remove: jest.fn() }) },
  Animated: {
    View: 'AnimatedView',
    Value: class { setValue = jest.fn(); },
    spring: () => ({ start: jest.fn() }),
  },
  PanResponder: { create: jest.fn((handlers) => ({ panHandlers: handlers })) },
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: 'GestureHandlerRootView' }));
jest.mock('../../components/common/SwipeBackBoundary', () => 'SwipeBackBoundary');
jest.mock('../../components/DM/MessageSurface', () => ({ __esModule: true, default: 'MessageSurface' }));
jest.mock('../../components/ui/SheetGlass', () => ({ __esModule: true, default: 'SheetGlass' }));
let mockBackdropBlur: 'ios' | 'android' | null = 'ios';
jest.mock('../../components/ui/SheetBackdrop', () => ({
  __esModule: true, default: 'SheetBackdrop',
  useSheetBackdrop: (active: boolean) => {
    const blur = active ? mockBackdropBlur : null;
    return { blur, blurred: !!blur, scrim: 'rgba(0,0,0,0.3)', light: false };
  },
}));

const drag = (dy: number, dx = 0, vy = 0) => ({ dy, dx, vy });
const handlers = (index = 0) => (PanResponder.create as jest.Mock).mock.calls[index][0];
beforeEach(() => jest.clearAllMocks());

it.each(['center', 'bottom'] as const)('uses theme material without changing %s dismissal or content', (presentation) => {
  const close = jest.fn();
  const screen = render(<GlassModal surface="theme" visible presentation={presentation} onClose={close}><View testID="sheet-content" /></GlassModal>);
  // Drawers take web's liquid glass in the system theme; cards keep the theme material.
  expect(screen.UNSAFE_getByType((presentation === 'bottom' ? 'SheetGlass' : 'MessageSurface') as any)).toBeTruthy();
  expect(screen.getByTestId('sheet-content')).toBeTruthy();
  fireEvent(screen.UNSAFE_getByType('Modal' as any), 'requestClose');
  expect(close).toHaveBeenCalledTimes(1);
});

it.each(['ios', 'android'])('blurs the page behind a drawer on %s and still dismisses on a tap', (os) => {
  const platform = jest.requireMock('react-native').Platform;
  platform.OS = os;
  mockBackdropBlur = os as 'ios' | 'android';
  try {
    const close = jest.fn();
    const screen = render(<GlassModal visible presentation="bottom" onClose={close}><View /></GlassModal>);
    const backdrop = screen.UNSAFE_getByType('SheetBackdrop' as any);
    expect(backdrop.props.backdrop.blur).toBe(os);
    // One blur per sheet: the panel's glass leans on the backdrop's.
    expect(screen.UNSAFE_getByType('SheetGlass' as any).props.backdropBlurred).toBe(true);
    fireEvent.press(backdrop.parent!);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    platform.OS = 'ios';
    mockBackdropBlur = 'ios';
  }
});

it('keeps the plain dim behind a centered card', () => {
  const screen = render(<GlassModal visible presentation="center" onClose={jest.fn()}><View /></GlassModal>);
  expect(screen.UNSAFE_queryByType('SheetBackdrop' as any)).toBeNull();
});

it('does not dismiss a locked drawer from the backdrop', () => {
  const close = jest.fn();
  const screen = render(<GlassModal visible presentation="bottom" dismissible={false} onClose={close}><View /></GlassModal>);
  fireEvent.press(screen.UNSAFE_getByType('SheetBackdrop' as any).parent!);
  expect(close).not.toHaveBeenCalled();
});

it('uses theme material by default and permits deliberate solid panels', () => {
  const screen = render(<GlassModal visible onClose={jest.fn()}><View /></GlassModal>);
  expect(screen.UNSAFE_getByType('MessageSurface' as any)).toBeTruthy();
  screen.rerender(<GlassModal visible surface="solid" onClose={jest.fn()}><View /></GlassModal>);
  expect(screen.UNSAFE_queryByType('MessageSurface' as any)).toBeNull();
});

it('keeps drawer gestures on the handle, outside scrollable inputs', () => {
  const screen = render(<GlassModal visible presentation="bottom" scrollable onClose={jest.fn()}><View /></GlassModal>);
  const scroll = screen.UNSAFE_getByType(ScrollView);
  expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
  const panel = screen.UNSAFE_getByType('AnimatedView' as any);
  expect(panel.props.onMoveShouldSetPanResponderCapture).toBeUndefined();
  expect(handlers().onMoveShouldSetPanResponderCapture({}, drag(100))).toBe(true);
});
it('keeps custom lists independent and allows dismissal from the handle', () => {
  const close = jest.fn();
  const screen = render(<GlassModal visible presentation="bottom" onClose={close}><View /></GlassModal>);
  expect(screen.UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  const handle = handlers();
  expect(handle.onMoveShouldSetPanResponderCapture({}, drag(100))).toBe(true);
  handle.onPanResponderRelease({}, drag(25, 0, 1));
  expect(close).toHaveBeenCalledTimes(1);
});

it.each([{ presentation: 'center' as const }, { presentation: 'bottom' as const, dismissible: false }])(
  'does not drag a center or locked modal: %j', (props) => {
    render(<GlassModal visible scrollable onClose={jest.fn()} {...props}><View /></GlassModal>);
    expect(handlers().onMoveShouldSetPanResponderCapture({}, drag(100))).toBe(false);
  },
);

it('does not dismiss for a short drag or cancellation', () => {
  const close = jest.fn();
  render(<GlassModal visible presentation="bottom" onClose={close}><View /></GlassModal>);
  handlers().onPanResponderRelease({}, drag(15));
  handlers().onPanResponderTerminate();
  expect(close).not.toHaveBeenCalled();
});

// The modal window starts at the top of the screen and the keyboard view's layout
// y already includes the foreground's top inset. An offset counts the status bar
// twice and leaves a dimmed strip between every input sheet and the keys.
it.each(['ios', 'android'])('lifts sheets flush onto the keyboard on %s', (os) => {
  const platform = jest.requireMock('react-native').Platform;
  platform.OS = os;
  try {
    for (const presentation of ['bottom', 'center'] as const) {
      const screen = render(<GlassModal visible presentation={presentation} onClose={jest.fn()}><View /></GlassModal>);
      const avoider = screen.UNSAFE_getByType('KeyboardAvoidingView' as any);
      expect(avoider.props.keyboardVerticalOffset ?? 0).toBe(0);
      expect(avoider.props.behavior).toBe(os === 'ios' ? 'padding' : 'height');
      screen.unmount();
    }
  } finally {
    platform.OS = 'ios';
  }
});

it('preserves buttons and horizontal gestures in standalone sheet headers', () => {
  const close = jest.fn();
  render(<SheetDismissHandle onClose={close}><View /></SheetDismissHandle>);
  const handle = handlers();
  expect(handle.onMoveShouldSetPanResponderCapture({}, drag(2))).toBe(false);
  expect(handle.onMoveShouldSetPanResponderCapture({}, drag(20, 70))).toBe(false);
  expect(handle.onMoveShouldSetPanResponderCapture({}, drag(90))).toBe(true);
  handle.onPanResponderRelease({}, drag(90));
  expect(close).toHaveBeenCalledTimes(1);
});

it('keeps a busy standalone sheet open', () => {
  const close = jest.fn();
  render(<SheetDismissHandle disabled onClose={close}><View /></SheetDismissHandle>);
  expect(handlers().onMoveShouldSetPanResponderCapture({}, drag(100))).toBe(false);
  handlers().onPanResponderRelease({}, drag(100));
  expect(close).not.toHaveBeenCalled();
});
