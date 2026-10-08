import { renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useScrubGesture } from '../../hooks/useScrubGesture';

jest.mock('../../context/PagerGestureContext', () => ({
  usePagerGestureRef: () => mockPagerRef,
}));
const mockPagerRef = { current: {} };

jest.mock('react-native-reanimated', () => ({
  runOnJS: (callback: unknown) => callback,
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
}));

jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const callbacks: Record<string, (...args: any[]) => void> = {};
    const gesture: Record<string, any> = { callbacks };
    for (const method of ['enabled', 'manualActivation', 'maxPointers', 'shouldCancelWhenOutside', 'runOnJS', 'maxDistance', 'blocksExternalGesture']) {
      gesture[method] = jest.fn(() => gesture);
    }
    for (const method of ['onTouchesDown', 'onTouchesMove', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      gesture[method] = (callback: (...args: any[]) => void) => {
        callbacks[method] = callback;
        return gesture;
      };
    }
    return gesture;
  };
  return { Gesture: { Pan: createGesture, Tap: createGesture, Race: (pan: any, tap: any) => ({ pan, tap }) } };
});

type CapturedGestures = {
  pan: { callbacks: Record<string, (...args: any[]) => void>; blocksExternalGesture: jest.Mock };
  tap: { callbacks: Record<string, (...args: any[]) => void>; blocksExternalGesture: jest.Mock };
};

describe('scrub touch ownership', () => {
  it('protects the track from parent presses without cancelling Android native gestures', () => {
    const { result } = renderHook(() => useScrubGesture({ onScrub: jest.fn(), onCommit: jest.fn() }));
    expect(result.current.touchGuard.onStartShouldSetResponder?.()).toBe(true);
    expect(result.current.touchGuard.onResponderGrant?.()).toBe(false);
  });

  it('does not seek when a tap loses to a drag or scroll', () => {
    const onScrubStart = jest.fn();
    const onCommit = jest.fn();
    const { result } = renderHook(() => useScrubGesture({ onScrubStart, onScrub: jest.fn(), onCommit }));
    const { tap } = result.current.gesture as unknown as CapturedGestures;
    tap.callbacks.onEnd({ x: 80 }, false);
    expect(onScrubStart).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits successful taps and drags against the measured track', () => {
    const onCommit = jest.fn();
    const { result } = renderHook(() => useScrubGesture({ onScrub: jest.fn(), onCommit }));
    result.current.onLayout({ nativeEvent: { layout: { width: 200 } } } as LayoutChangeEvent);
    const { tap, pan } = result.current.gesture as unknown as CapturedGestures;
    tap.callbacks.onEnd({ x: 50 }, true);
    expect(onCommit).toHaveBeenLastCalledWith(0.25);
    pan.callbacks.onEnd({ x: 150 }, true);
    expect(onCommit).toHaveBeenLastCalledWith(0.75);
  });

  it('cancels an interrupted drag without committing its last position', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    const { result } = renderHook(() => useScrubGesture({ onScrub: jest.fn(), onCommit, onCancel }));
    const { pan } = result.current.gesture as unknown as CapturedGestures;
    pan.callbacks.onStart({ x: 20 });
    pan.callbacks.onEnd({ x: 150 }, false);
    pan.callbacks.onFinalize({ x: 150 }, false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('blocks the pager while direction is pending and throughout a held scrub', () => {
    const { result } = renderHook(() => useScrubGesture({ onScrub: jest.fn(), onCommit: jest.fn() }));
    const { pan, tap } = result.current.gesture as unknown as CapturedGestures;
    expect(pan.blocksExternalGesture).toHaveBeenCalledWith(mockPagerRef);
    expect(tap.blocksExternalGesture).toHaveBeenCalledWith(mockPagerRef);
    const manager = { activate: jest.fn(), fail: jest.fn() };
    const move = (x: number, y: number) => ({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y, y }] });
    pan.callbacks.onTouchesDown(move(20, 20), manager);
    pan.callbacks.onTouchesMove(move(21, 21), manager);
    expect(manager.activate).not.toHaveBeenCalled();
    expect(manager.fail).not.toHaveBeenCalled();
    // Both axes cross 6pt in one event: horizontal intent must still win.
    pan.callbacks.onTouchesMove(move(55, 30), manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
    pan.callbacks.onTouchesMove(move(10, 100), manager);
    expect(manager.fail).not.toHaveBeenCalled();
  });

  it('claims the bottom seek strip even when the first movement is vertical', () => {
    const { result } = renderHook(() => useScrubGesture({ immediateBottom: 14, onScrub: jest.fn(), onCommit: jest.fn() }));
    result.current.onLayout({ nativeEvent: { layout: { width: 200, height: 48 } } } as LayoutChangeEvent);
    const { pan } = result.current.gesture as unknown as CapturedGestures;
    const manager = { activate: jest.fn(), fail: jest.fn() };
    pan.callbacks.onTouchesDown({ numberOfTouches: 1, allTouches: [{ absoluteX: 20, absoluteY: 400, y: 45 }] }, manager);
    pan.callbacks.onTouchesMove({ numberOfTouches: 1, allTouches: [{ absoluteX: 21, absoluteY: 410 }] }, manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
    expect(manager.fail).not.toHaveBeenCalled();
  });

  it('still yields a vertical scroll starting over the shared button row', () => {
    const onCancel = jest.fn();
    const { result } = renderHook(() => useScrubGesture({ onScrub: jest.fn(), onCommit: jest.fn(), onCancel }));
    const { pan } = result.current.gesture as unknown as CapturedGestures;
    const manager = { activate: jest.fn(), fail: jest.fn() };
    pan.callbacks.onTouchesDown({ numberOfTouches: 1, allTouches: [{ absoluteX: 20, absoluteY: 20, y: 20 }] }, manager);
    pan.callbacks.onTouchesMove({ numberOfTouches: 1, allTouches: [{ absoluteX: 22, absoluteY: 40 }] }, manager);
    pan.callbacks.onFinalize({}, false);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.activate).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('keeps the recognizer stable through preview renders and uses current callbacks', () => {
    const firstCommit = jest.fn(), nextCommit = jest.fn();
    const { result, rerender } = renderHook(({ onCommit }) => useScrubGesture({ onScrub: jest.fn(), onCommit }), { initialProps: { onCommit: firstCommit } });
    result.current.onLayout({ nativeEvent: { layout: { width: 200, height: 48 } } } as LayoutChangeEvent);
    const initialGesture = result.current.gesture;
    const { pan } = initialGesture as unknown as CapturedGestures;
    pan.callbacks.onStart({ x: 20 });
    rerender({ onCommit: nextCommit });
    expect(result.current.gesture).toBe(initialGesture);
    pan.callbacks.onUpdate({ x: -10 });
    pan.callbacks.onEnd({ x: 250 }, true);
    expect(nextCommit).toHaveBeenCalledWith(1);
    expect(firstCommit).not.toHaveBeenCalled();
  });
});
