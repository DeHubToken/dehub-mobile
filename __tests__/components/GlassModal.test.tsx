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

const drag = (dy: number, dx = 0, vy = 0) => ({ dy, dx, vy });
const handlers = (index = 0) => (PanResponder.create as jest.Mock).mock.calls[index][0];
beforeEach(() => jest.clearAllMocks());

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
