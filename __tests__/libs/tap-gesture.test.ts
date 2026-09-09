import {
  continuesTapGesture,
  TAP_GESTURE_WINDOW_MS,
  TAP_REACTION_RESOLUTION_MS,
} from '../../libs/tap-gesture';

describe('tap gesture timing', () => {
  it('keeps a measured desktop-style 315ms cadence in one gesture', () => {
    expect(continuesTapGesture(1_000, 1_315)).toBe(true);
  });

  it('starts fresh once the gesture window has elapsed', () => {
    expect(continuesTapGesture(1_000, 1_000 + TAP_GESTURE_WINDOW_MS)).toBe(false);
  });

  it('gives tap three the same forgiving window before persisting Like', () => {
    expect(TAP_REACTION_RESOLUTION_MS).toBe(TAP_GESTURE_WINDOW_MS);
  });
});
