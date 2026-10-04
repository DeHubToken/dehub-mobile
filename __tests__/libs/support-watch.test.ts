import { supportedWatchDelta } from '../../libs/support-watch';

describe('creator support watch time', () => {
  it('counts normal playback and bounds time by wall clock', () => {
    expect(supportedWatchDelta(0.5, 0.5, true, true)).toBe(0.5);
    expect(supportedWatchDelta(0.7, 0.5, true, true)).toBe(0.5);
  });
  it('does not reward seeking or sped-up playback', () => {
    expect(supportedWatchDelta(30, 0.5, true, true)).toBe(0);
    expect(supportedWatchDelta(1, 0.5, true, true)).toBe(0);
    expect(supportedWatchDelta(-5, 0.5, true, true)).toBe(0);
  });
  it('does not count pauses, background time or delayed events', () => {
    expect(supportedWatchDelta(0.5, 0.5, false, true)).toBe(0);
    expect(supportedWatchDelta(0.5, 0.5, true, false)).toBe(0);
    expect(supportedWatchDelta(1, 45, true, true)).toBe(0);
    expect(supportedWatchDelta(NaN, 0.5, true, true)).toBe(0);
  });
});
