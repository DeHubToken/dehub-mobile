import { feedSeekResponder } from '../../libs/feed-seek-responder';

describe('feed timeline gesture ownership', () => {
  function setup() {
    const seek = jest.fn();
    const finish = jest.fn();
    const handlers = feedSeekResponder(seek, finish);
    const event = { nativeEvent: { locationX: 42 } } as any;
    const gesture = (dx: number, dy: number) => ({ dx, dy } as any);
    handlers.onPanResponderGrant!(event, gesture(0, 0));
    return { seek, finish, handlers, event, gesture };
  }

  it('yields a vertical swipe without changing playback position', () => {
    const s = setup();
    s.handlers.onPanResponderMove!(s.event, s.gesture(2, 25));
    expect(s.handlers.onPanResponderTerminationRequest!(s.event, s.gesture(2, 25))).toBe(true);
    expect(s.handlers.onShouldBlockNativeResponder!(s.event, s.gesture(2, 25))).toBe(false);
    s.handlers.onPanResponderRelease!(s.event, s.gesture(2, 25));
    expect(s.seek).not.toHaveBeenCalled();
    expect(s.finish).toHaveBeenCalledTimes(1);
  });

  it('keeps a horizontal scrub even when the finger drifts vertically', () => {
    const s = setup();
    s.handlers.onPanResponderMove!(s.event, s.gesture(25, 2));
    s.handlers.onPanResponderMove!(s.event, s.gesture(25, 40));
    expect(s.handlers.onPanResponderTerminationRequest!(s.event, s.gesture(25, 40))).toBe(false);
    expect(s.seek).toHaveBeenCalledTimes(2);
    s.handlers.onPanResponderRelease!(s.event, s.gesture(25, 40));
    expect(s.seek).toHaveBeenLastCalledWith(42);
  });

  it('seeks once on a tap and never on cancellation', () => {
    const s = setup();
    expect(s.seek).not.toHaveBeenCalled();
    s.handlers.onPanResponderRelease!(s.event, s.gesture(0, 0));
    expect(s.seek).toHaveBeenCalledTimes(1);
    s.handlers.onPanResponderGrant!(s.event, s.gesture(0, 0));
    s.handlers.onPanResponderTerminate!(s.event, s.gesture(0, 0));
    expect(s.seek).toHaveBeenCalledTimes(1);
  });

  it('does not turn a vertical swipe into a seek after diagonal movement', () => {
    const s = setup();
    s.handlers.onPanResponderMove!(s.event, s.gesture(1, 20));
    s.handlers.onPanResponderMove!(s.event, s.gesture(60, 25));
    s.handlers.onPanResponderRelease!(s.event, s.gesture(60, 25));
    expect(s.seek).not.toHaveBeenCalled();
  });
});
