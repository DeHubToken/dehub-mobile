/** Distances are points and velocity is points per second. */
export function completesSwipeBack(distance: number, vertical: number, velocity: number): boolean {
  return Math.abs(vertical) <= 32 && distance > Math.abs(vertical) * 2 &&
    (distance >= 64 || (distance >= 28 && velocity >= 650));
}

/**
 * The interactive edge back, where the page follows the finger instead of
 * waiting for the release. A release finishes leaving when the page is on its
 * way out: most of the way there once the flick is carried on for a moment,
 * or a rightward fling that has clearly started. A flick back toward the edge
 * always cancels, however far the page had come. Same rules as the iOS pop.
 */
const COMMIT_FRACTION = 0.4;
const PROJECTION_SECONDS = 0.12;
const FLING_VELOCITY = 600;
const FLING_MIN_DISTANCE = 24;
const CANCEL_VELOCITY = 250;

export function settlesSwipeBack(distance: number, velocity: number, width: number): boolean {
  'worklet';
  if (!(width > 0) || !(distance > 0)) return false;
  if (velocity <= -CANCEL_VELOCITY) return false;
  if (velocity >= FLING_VELOCITY && distance >= FLING_MIN_DISTANCE) return true;
  return distance + Math.max(0, velocity) * PROJECTION_SECONDS >= width * COMMIT_FRACTION;
}

/** 0 at rest, 1 once the page has left the screen. */
export function swipeBackProgress(distance: number, width: number): number {
  'worklet';
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, distance / width));
}

/**
 * Settles without passing either end: overshooting the far edge would show a
 * gap, overshooting rest would nudge the page off the left of the screen. The
 * release velocity is handed in on top, so a fast flick keeps its speed.
 */
export const SWIPE_BACK_SPRING = { damping: 26, stiffness: 320, mass: 1, overshootClamping: true } as const;
