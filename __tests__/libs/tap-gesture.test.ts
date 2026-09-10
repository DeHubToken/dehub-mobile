import {
  continuesTapGesture,
  TAP_GESTURE_WINDOW_MS,
  TAP_LIKE_ANIMATION_MS,
  TAP_LOVE_ANIMATION_MS,
  TAP_REACTION_RESOLUTION_MS,
} from '../../libs/tap-gesture';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('keeps reaction feedback on screen long enough to survive video paint', () => {
    expect(TAP_LIKE_ANIMATION_MS).toBeGreaterThanOrEqual(900);
    expect(TAP_LOVE_ANIMATION_MS).toBeGreaterThanOrEqual(1_100);
    expect(TAP_LOVE_ANIMATION_MS).toBeGreaterThan(TAP_LIKE_ANIMATION_MS);
  });
});

describe('shorts player wiring', () => {
  const source = readFileSync(resolve(__dirname, '../../screens/ShortsViewerScreen.tsx'), 'utf8');

  it('toggles playback immediately and reverses it only for tap two', () => {
    const firstTap = source.indexOf('singleTapToggledPlaybackRef.current = true');
    const immediateToggle = source.indexOf('togglePlayPauseRef.current();', firstTap);
    const timer = source.indexOf('tapTimerRef.current = setTimeout', firstTap);
    const undoGuard = source.indexOf('if (singleTapToggledPlaybackRef.current)');

    expect(firstTap).toBeGreaterThan(-1);
    expect(immediateToggle).toBeGreaterThan(firstTap);
    expect(immediateToggle).toBeLessThan(timer);
    expect(undoGuard).toBeGreaterThan(timer);
  });

  it('lets stationary taps coexist with the vertical pager recognizer', () => {
    expect(source.match(/\.simultaneousWithExternalGesture\(pagerGesture\)/g)).toHaveLength(2);
  });
});
