import {
  MEDIA_TAP_SLOP_PX,
  movedBeyondMediaTapSlop,
} from '../../libs/media-gesture';

describe('media gesture intent', () => {
  it('keeps normal finger jitter as a tap', () => {
    expect(movedBeyondMediaTapSlop({ x: 50, y: 50 }, { x: 54, y: 53 })).toBe(false);
  });

  it('hands a vertical flick to the scroller', () => {
    expect(movedBeyondMediaTapSlop({ x: 50, y: 50 }, { x: 50, y: 90 })).toBe(true);
  });

  it('uses an exclusive boundary so the recognizer and JS guard agree', () => {
    expect(movedBeyondMediaTapSlop(
      { x: 0, y: 0 },
      { x: MEDIA_TAP_SLOP_PX, y: 0 },
    )).toBe(false);
    expect(movedBeyondMediaTapSlop(
      { x: 0, y: 0 },
      { x: MEDIA_TAP_SLOP_PX + 0.01, y: 0 },
    )).toBe(true);
  });
});
