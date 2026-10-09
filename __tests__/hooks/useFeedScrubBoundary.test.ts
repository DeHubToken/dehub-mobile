import { renderHook } from '@testing-library/react-native';
import { useFeedScrubBoundary } from '../../hooks/useFeedScrubBoundary';

const mockPagerRef = { current: {} };
const mockMeasure = jest.fn();
jest.mock('../../context/PagerGestureContext', () => ({ usePagerGestureRef: () => mockPagerRef }));
jest.mock('react-native-reanimated', () => ({
  runOnJS: (callback: unknown) => callback,
  useSharedValue: (value: unknown) => require('react').useRef({ value }).current,
  useAnimatedRef: () => require('react').useRef(null),
  measure: (...args: unknown[]) => mockMeasure(...args),
}));
jest.mock('react-native-gesture-handler', () => ({
  Gesture: { Pan: () => {
    const callbacks: Record<string, (...args: any[]) => void> = {};
    const gesture: Record<string, any> = { callbacks };
    for (const method of ['manualActivation', 'maxPointers', 'shouldCancelWhenOutside', 'blocksExternalGesture']) {
      gesture[method] = jest.fn(() => gesture);
    }
    for (const method of ['onTouchesDown', 'onStart', 'onUpdate', 'onEnd']) {
      gesture[method] = (callback: (...args: any[]) => void) => { callbacks[method] = callback; return gesture; };
    }
    return gesture;
  } },
}));

function setup() {
  mockMeasure.mockReturnValue({ pageX: 10, pageY: 300, width: 200, height: 80 });
  const { result, rerender } = renderHook(() => useFeedScrubBoundary());
  const player = { start: jest.fn(), preview: jest.fn(), commit: jest.fn(), cancel: jest.fn() };
  const unregister = result.current.controller.register(player);
  const pan = result.current.gesture as unknown as {
    callbacks: Record<string, (...args: any[]) => void>;
    blocksExternalGesture: jest.Mock;
    shouldCancelWhenOutside: jest.Mock;
  };
  const down = (x: number, y: number) => {
    const manager = { activate: jest.fn(), fail: jest.fn() };
    pan.callbacks.onTouchesDown({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y }] }, manager);
    return manager;
  };
  return { result, rerender, player, unregister, pan, down };
}

describe('feed scrub boundary', () => {
  it('owns near-track caption/profile touches and retains navigation suppression after release', () => {
    const s = setup();
    expect(s.pan.blocksExternalGesture).toHaveBeenCalledWith(mockPagerRef);
    expect(s.pan.shouldCancelWhenOutside).toHaveBeenCalledWith(false);
    expect(s.down(30, 400).activate).toHaveBeenCalledTimes(1);
    expect(s.result.current.claimed.value).toBe(true);
    s.pan.callbacks.onStart({ absoluteX: 30, absoluteY: 400 });
    expect(s.player.start).toHaveBeenCalledTimes(1);
    expect(s.player.preview).toHaveBeenLastCalledWith(0.1);
    s.pan.callbacks.onUpdate({ absoluteX: 250, absoluteY: 470 });
    expect(s.player.preview).toHaveBeenLastCalledWith(1);
    s.pan.callbacks.onUpdate({ absoluteX: -10, absoluteY: 260 });
    expect(s.player.preview).toHaveBeenLastCalledWith(0);
    s.pan.callbacks.onEnd({ absoluteX: 110, absoluteY: 440 }, true);
    expect(s.player.commit).toHaveBeenCalledWith(0.5);
    expect(s.result.current.claimed.value).toBe(true);
    expect(s.down(30, 420).fail).toHaveBeenCalledTimes(1);
    expect(s.result.current.claimed.value).toBe(false);
  });

  it('lets the in-player strip own buttons while still guarding parent navigation', () => {
    const s = setup(), manager = s.down(30, 330);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.activate).not.toHaveBeenCalled();
    expect(s.result.current.claimed.value).toBe(true);
    expect(s.player.start).not.toHaveBeenCalled();
  });

  it('leaves deliberate taps outside the enlarged target alone', () => {
    const s = setup();
    for (const [x, y] of [[9, 390], [211, 390], [30, 405], [30, 299]]) {
      const manager = s.down(x, y);
      expect(manager.activate).not.toHaveBeenCalled();
      expect(manager.fail).toHaveBeenCalledTimes(1);
      expect(s.result.current.claimed.value).toBe(false);
    }
  });

  it('measures the current scrolled position and stays stable through preview renders', () => {
    const s = setup(), gesture = s.result.current.gesture;
    mockMeasure.mockReturnValue({ pageX: 10, pageY: 500, width: 200, height: 80 });
    expect(s.down(30, 400).fail).toHaveBeenCalledTimes(1);
    expect(s.down(30, 590).activate).toHaveBeenCalledTimes(1);
    s.rerender({});
    expect(s.result.current.gesture).toBe(gesture);
  });

  it('cancels an interrupted scrub and disables the boundary when the player unregisters', () => {
    const s = setup();
    s.down(30, 390);
    s.pan.callbacks.onStart({ absoluteX: 30 });
    s.pan.callbacks.onEnd({ absoluteX: 130 }, false);
    expect(s.player.cancel).toHaveBeenCalledTimes(1);
    expect(s.player.commit).not.toHaveBeenCalled();
    expect(s.result.current.claimed.value).toBe(true);
    s.unregister();
    expect(s.result.current.claimed.value).toBe(false);
    expect(s.down(30, 390).fail).toHaveBeenCalledTimes(1);
  });
});
