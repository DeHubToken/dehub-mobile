import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
jest.mock('react-native-css-interop/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('dehub-jsx/jsx-runtime', () => jest.requireActual('react/jsx-runtime'));
jest.mock('react-native', () => ({ View: 'View', Platform: { OS: 'android' }, I18nManager: { isRTL: false }, Keyboard: { dismiss: jest.fn() }, Dimensions: { get: () => ({ width: 400, height: 800 }) }, StyleSheet: { create: (s: object) => s } }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'Animated.View' }, useSharedValue: (value: unknown) => jest.requireActual('react').useRef({ value }).current, useAnimatedStyle: () => ({}), withTiming: (value: number) => value, runOnJS: (fn: (...args: unknown[]) => unknown) => fn }));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
const mockGesture = {
  enabled: jest.fn().mockReturnThis(), hitSlop: jest.fn().mockReturnThis(), activeOffsetX: jest.fn().mockReturnThis(),
  failOffsetY: jest.fn().mockReturnThis(), maxPointers: jest.fn().mockReturnThis(), runOnJS: jest.fn().mockReturnThis(),
  onBegin: jest.fn().mockReturnThis(), onTouchesDown: jest.fn().mockReturnThis(),
  onEnd: jest.fn().mockReturnThis(), manualActivation: jest.fn().mockReturnThis(), onTouchesMove: jest.fn().mockReturnThis(),
  onStart: jest.fn().mockReturnThis(), onUpdate: jest.fn().mockReturnThis(), onFinalize: jest.fn().mockReturnThis(),
};
jest.mock('react-native-gesture-handler', () => ({ Gesture: { Pan: () => mockGesture }, GestureDetector: ({ children }: any) => children }));
import SwipeBackBoundary from '../../components/common/SwipeBackBoundary';
import { useOwnEdgeSwipe, useSwipeBackAction } from '../../hooks/useSwipeBack';
function Local({ back }: { back?: () => void }) { useSwipeBackAction(back); return null; }
const swipe = () => act(() => mockGesture.onEnd.mock.calls[mockGesture.onEnd.mock.calls.length - 1][0]({ translationX: 90, translationY: 4, velocityX: 200 }));
let tree: ReactTestRenderer;
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => { act(() => tree?.unmount()); jest.useRealTimers(); });
test('a local profile/collection back wins over a stack pop, uses latest handler and unregisters', () => {
  const pop = jest.fn(), first = jest.fn(), latest = jest.fn();
  act(() => { tree = create(<SwipeBackBoundary onBack={pop}><Local back={first} /></SwipeBackBoundary>); });
  act(() => tree.update(<SwipeBackBoundary onBack={pop}><Local back={latest} /></SwipeBackBoundary>));
  swipe(); swipe();
  expect(latest).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled(); expect(pop).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(601); tree.update(<SwipeBackBoundary onBack={pop}><Local /></SwipeBackBoundary>); });
  swipe(); expect(pop).toHaveBeenCalledTimes(1);
});
test('a covered or blurred screen cannot receive a back swipe', () => {
  const pop = jest.fn();
  act(() => { tree = create(<SwipeBackBoundary onBack={pop} isFocused={() => false}><Local /></SwipeBackBoundary>); });
  swipe(); expect(pop).not.toHaveBeenCalled();
});
test('adding a second finger after activation cancels back', () => {
  const pop = jest.fn();
  act(() => { tree = create(<SwipeBackBoundary onBack={pop}><Local /></SwipeBackBoundary>); });
  act(() => mockGesture.onTouchesDown.mock.calls[mockGesture.onTouchesDown.mock.calls.length - 1][0]({ numberOfTouches: 2, allTouches: [] }, { fail: jest.fn() }));
  swipe(); expect(pop).not.toHaveBeenCalled();
});
test('a screen with its own interactive edge back turns the screen-wide one off while mounted', () => {
  const pop = jest.fn();
  function Owner() { useOwnEdgeSwipe(); return null; }
  const lastEnabled = () => mockGesture.enabled.mock.calls[mockGesture.enabled.mock.calls.length - 1][0];
  act(() => { tree = create(<SwipeBackBoundary onBack={pop}><Owner /></SwipeBackBoundary>); });
  expect(lastEnabled()).toBe(false);
  act(() => tree.update(<SwipeBackBoundary onBack={pop}><Local /></SwipeBackBoundary>));
  expect(lastEnabled()).toBe(true);
});
test('a drag away from the edge claims back only over plain page', () => {
  act(() => { tree = create(<SwipeBackBoundary onBack={jest.fn()}><Local /></SwipeBackBoundary>); });
  const last = <T,>(fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0] as T;
  const down = (x: number) => last<(e: object, s: object) => void>(mockGesture.onTouchesDown)({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: 300 }] }, {});
  const move = (x: number) => { const state = { fail: jest.fn(), activate: jest.fn() }; last<(e: object, s: object) => void>(mockGesture.onTouchesMove)({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: 302 }] }, state); return state; };
  down(150);
  expect(move(190).fail).toHaveBeenCalled();
  down(10);
  expect(move(40).activate).toHaveBeenCalled();
});
