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
jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const callbacks: Record<string, (...args: any[]) => void> = {};
    const gesture: Record<string, any> = { callbacks };
    for (const method of ['manualActivation', 'maxPointers', 'maxDistance', 'shouldCancelWhenOutside', 'blocksExternalGesture']) {
      gesture[method] = jest.fn(() => gesture);
    }
    for (const method of ['onTouchesDown', 'onTouchesMove', 'onStart', 'onUpdate', 'onEnd']) {
      gesture[method] = (callback: (...args: any[]) => void) => { callbacks[method] = callback; return gesture; };
    }
    return gesture;
  };
  return { Gesture: { Pan: createGesture, Tap: createGesture, Race: (pan: any, tap: any) => ({ pan, tap }) } };
});

function setup() {
  mockMeasure.mockReturnValue({ pageX: 10, pageY: 316, width: 200, height: 64 });
  const { result, rerender } = renderHook(() => useFeedScrubBoundary());
  const player = { start: jest.fn(), preview: jest.fn(), commit: jest.fn(), cancel: jest.fn() };
  const unregister = result.current.controller.register(player);
  const { pan, tap } = result.current.gesture as unknown as { pan: {
    callbacks: Record<string, (...args: any[]) => void>;
    blocksExternalGesture: jest.Mock;
    shouldCancelWhenOutside: jest.Mock;
  }; tap: { callbacks: Record<string, (...args: any[]) => void> } };
  const down = (x: number, y: number) => {
    const manager = { activate: jest.fn(), fail: jest.fn() };
    pan.callbacks.onTouchesDown({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y }] }, manager);
    return manager;
  };
  const move = (x: number, y: number, manager: ReturnType<typeof down>) => {
    pan.callbacks.onTouchesMove({ numberOfTouches: 1, allTouches: [{ absoluteX: x, absoluteY: y }] }, manager);
  };
  return { result, rerender, player, unregister, pan, tap, down, move };
}

describe('feed scrub boundary', () => {
  it('owns near-track caption/profile touches and retains navigation suppression after release', () => {
    const s = setup();
    expect(s.pan.blocksExternalGesture).toHaveBeenCalledWith(mockPagerRef);
    expect(s.pan.shouldCancelWhenOutside).toHaveBeenCalledWith(false);
    const manager = s.down(30, 404);
    expect(manager.activate).not.toHaveBeenCalled();
    s.move(50, 406, manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
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
    const s = setup(), manager = s.down(30, 316);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.activate).not.toHaveBeenCalled();
    expect(s.result.current.claimed.value).toBe(true);
    expect(s.player.start).not.toHaveBeenCalled();
  });

  it('leaves deliberate taps outside the enlarged target alone', () => {
    const s = setup();
    for (const [x, y] of [[9, 390], [211, 390], [30, 405], [30, 315]]) {
      const manager = s.down(x, y);
      expect(manager.activate).not.toHaveBeenCalled();
      expect(manager.fail).toHaveBeenCalledTimes(1);
      expect(s.result.current.claimed.value).toBe(false);
    }
  });

  it('measures the current scrolled position and stays stable through preview renders', () => {
    const s = setup(), gesture = s.result.current.gesture;
    mockMeasure.mockReturnValue({ pageX: 10, pageY: 516, width: 200, height: 64 });
    expect(s.down(30, 400).fail).toHaveBeenCalledTimes(1);
    const manager = s.down(30, 590);
    s.move(50, 592, manager);
    expect(manager.activate).toHaveBeenCalledTimes(1);
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

  it('yields a vertical feed swipe below the player without seeking', () => {
    const s = setup(), manager = s.down(30, 390);
    s.move(31, 360, manager);
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.activate).not.toHaveBeenCalled();
    s.tap.callbacks.onEnd({ absoluteX: 31 }, false);
    expect(s.player.start).not.toHaveBeenCalled();
    expect(s.player.commit).not.toHaveBeenCalled();
  });

  it('still seeks on a stationary tap below the player', () => {
    const s = setup(), manager = { fail: jest.fn() };
    s.tap.callbacks.onTouchesDown({ numberOfTouches: 1, allTouches: [{ absoluteX: 110, absoluteY: 390 }] }, manager);
    expect(manager.fail).not.toHaveBeenCalled();
    s.tap.callbacks.onEnd({ absoluteX: 110 }, true);
    expect(s.player.start).toHaveBeenCalledTimes(1);
    expect(s.player.commit).toHaveBeenCalledWith(0.5);
  });
});
