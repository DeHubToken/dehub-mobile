import {
  feedVolumeResponder,
  VOLUME_HOLD_MS,
  VOLUME_TRAVEL_PX,
} from '../../libs/feed-volume-responder';

const gesture = (dx: number, dy: number) => ({ dx, dy }) as any;
const event = {} as any;

function harness(startVolume = 0.5) {
  const levels: number[] = [];
  let taps = 0;
  let ends = 0;
  let holds = 0;
  const handlers = feedVolumeResponder({
    onHoldStart: () => { holds++; return startVolume; },
    onVolume: (v) => levels.push(v),
    onTap: () => { taps++; },
    onEnd: () => { ends++; },
  });
  return { handlers, levels, counts: () => ({ taps, ends, holds }) };
}

describe('feed volume responder', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('treats a press with no travel as the mute toggle', () => {
    const h = harness();
    h.handlers.onPanResponderGrant!(event, gesture(0, 0));
    h.handlers.onPanResponderRelease!(event, gesture(0, 2));

    expect(h.counts().taps).toBe(1);
    expect(h.counts().holds).toBe(0);
    expect(h.levels).toEqual([]);
  });

  it('leaves the feed its vertical flick until the hold lands', () => {
    const h = harness();
    h.handlers.onPanResponderGrant!(event, gesture(0, 0));
    expect(h.handlers.onPanResponderTerminationRequest!(event, gesture(0, 0))).toBe(true);

    // A finger that is already travelling is scrolling, so the hold is off.
    h.handlers.onPanResponderMove!(event, gesture(0, -40));
    jest.advanceTimersByTime(VOLUME_HOLD_MS);
    h.handlers.onPanResponderMove!(event, gesture(0, -80));

    expect(h.counts().holds).toBe(0);
    expect(h.levels).toEqual([]);
  });

  it('turns the video down on a drag down and up on a drag up', () => {
    const h = harness(0.5);
    h.handlers.onPanResponderGrant!(event, gesture(0, 0));
    jest.advanceTimersByTime(VOLUME_HOLD_MS);
    expect(h.counts().holds).toBe(1);
    // Once it is holding, the gesture is this button's and not the feed's.
    expect(h.handlers.onPanResponderTerminationRequest!(event, gesture(0, 0))).toBe(false);

    h.handlers.onPanResponderMove!(event, gesture(0, VOLUME_TRAVEL_PX / 4));
    h.handlers.onPanResponderMove!(event, gesture(0, -VOLUME_TRAVEL_PX / 4));

    expect(h.levels).toEqual([0.25, 0.75]);
  });

  it('clamps at silence and at full, and does not fire a tap after a drag', () => {
    const h = harness(0.5);
    h.handlers.onPanResponderGrant!(event, gesture(0, 0));
    jest.advanceTimersByTime(VOLUME_HOLD_MS);

    h.handlers.onPanResponderMove!(event, gesture(0, VOLUME_TRAVEL_PX * 2));
    h.handlers.onPanResponderMove!(event, gesture(0, -VOLUME_TRAVEL_PX * 2));
    h.handlers.onPanResponderRelease!(event, gesture(0, -VOLUME_TRAVEL_PX * 2));

    expect(h.levels).toEqual([0, 1]);
    expect(h.counts().taps).toBe(0);
    expect(h.counts().ends).toBe(1);
  });

  it('ends the gesture when it is taken away mid-drag', () => {
    const h = harness();
    h.handlers.onPanResponderGrant!(event, gesture(0, 0));
    jest.advanceTimersByTime(VOLUME_HOLD_MS);
    h.handlers.onPanResponderTerminate!(event, gesture(0, 0));

    expect(h.counts().ends).toBe(1);
  });
});
