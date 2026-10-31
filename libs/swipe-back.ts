/** Distances are points and velocity is points per second. */
export function completesSwipeBack(distance: number, vertical: number, velocity: number, minDistance = 64): boolean {
  'worklet';
  return Math.abs(vertical) <= Math.max(32, minDistance / 2) && distance > Math.abs(vertical) * 2 &&
    (distance >= minDistance || (distance >= 28 && velocity >= 650));
}

/** The leading strip where a drag always means back (the original edge swipe). */
export const SWIPE_BACK_EDGE = 28;
/** Further in, the page is dragged rather than its edge, so it asks for a longer pull. */
export const SWIPE_BACK_PAGE_DISTANCE = 88;

// Native views that own a sideways drag. Android draws a horizontal list as its
// own view class, so a carousel or chip row is told apart from the page.
const SIDEWAYS_LIST = /HorizontalScroll/i;
const OWNS_SIDEWAYS = /ViewPager|PagerView|TextInput|Slider|WebView|Picker|SkiaView|SkiaPicture|Canvas/i;

type HostNode = { nodeName?: string; parentNode?: HostNode | null; scrollLeft?: number; viewConfig?: { uiViewClassName?: string } };

/**
 * Whether a drag that starts away from the edge, on the touched host view, may
 * go back: true for plain page, false over anything that swipes sideways. Only
 * the views between the touch and `stopAt` (the page itself) are looked at, so
 * what holds the page (tabs, sheets, the app shell) never blocks it. A
 * sideways list already at its start has nothing to scroll back to, so back
 * takes the drag there too, as on web.
 */
export function pageSwipeAllowed(target: unknown, stopAt?: unknown): boolean {
  let node = target as HostNode | null | undefined;
  if (!node || typeof node !== 'object') return false;
  if (!('parentNode' in node)) return true;
  for (let depth = 0; node && node !== stopAt && depth < 60; depth++, node = node.parentNode) {
    const name = node.nodeName || node.viewConfig?.uiViewClassName || '';
    if (OWNS_SIDEWAYS.test(name)) return false;
    if (SIDEWAYS_LIST.test(name) && Math.abs(node.scrollLeft ?? 1) > 1) return false;
  }
  return true;
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
