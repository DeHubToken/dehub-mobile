import { renderHook } from '@testing-library/react-native';
import type { LayoutChangeEvent } from 'react-native';
import { useScrubGesture } from '../../hooks/useScrubGesture';

jest.mock('../../context/PagerGestureContext', () => ({
  usePagerGestureRef: () => null,
}));

jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const callbacks: Record<string, (...args: any[]) => void> = {};
    const gesture: Record<string, any> = { callbacks };
    for (const method of ['enabled', 'minDistance', 'activeOffsetX', 'runOnJS', 'maxDistance', 'blocksExternalGesture']) {
      gesture[method] = () => gesture;
    }
    for (const method of ['onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
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
  pan: { callbacks: Record<string, (...args: any[]) => void> };
  tap: { callbacks: Record<string, (...args: any[]) => void> };
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
    pan.callbacks.onEnd({ x: 150 }, false);
    pan.callbacks.onFinalize({ x: 150 }, false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
