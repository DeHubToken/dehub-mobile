/**
 * "Is a feed currently being flung?" — a single flag outside React, for work
 * that should pause while a list moves (the theme backdrop).
 *
 * Nothing a reader can see waits on this. Rows used to mount their buttons and
 * icons only once the list settled, and a slow drag or a fling brought posts
 * in with no action row at all.
 */
// A drag with the finger held down can outlast any fling; nothing should stay
// deferred forever because a settle event was missed (a list unmounting
// mid-fling, for one). Longer than any real fling, shorter than a user notices.
const SAFETY_MS = 2500;

let scrolling = false;
let settledAt = -Infinity;
let safety: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const startListeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function isFeedScrolling(): boolean {
  return scrolling;
}

/**
 * A touch landing now would only stop a moving feed. The grace covers the
 * list reporting the stop (onMomentumScrollEnd) a frame or two before the
 * touch that caused it reaches JS.
 */
export const STOP_TAP_GRACE_MS = 150;
export function isFeedGliding(now = Date.now()): boolean {
  return scrolling || now - settledAt < STOP_TAP_GRACE_MS;
}

export function setFeedScrolling(next: boolean): void {
  if (safety) {
    clearTimeout(safety);
    safety = null;
  }
  if (next) {
    const started = !scrolling;
    scrolling = true;
    if (started) startListeners.forEach((fn) => fn());
    safety = setTimeout(() => {
      safety = null;
      if (scrolling) {
        scrolling = false;
        // A missed settle event: the list stopped long ago, not just now.
        notify();
      }
    }, SAFETY_MS);
    return;
  }
  if (!scrolling) return;
  scrolling = false;
  settledAt = Date.now();
  notify();
}

/**
 * Responder capture for a feed's wrapper: a finger that lands on a gliding
 * feed makes the wrapper the responder, so the touch only stops the list and
 * no post, photo or video under it gets a press. Native lists work this way;
 * Android delivered the press anyway.
 */
export function captureScrollStopTouch(): boolean {
  return isFeedGliding();
}

export function subscribeFeedSettled(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Fires when a feed goes from rest to moving; the settle side is above. */
export function subscribeFeedScrollStart(fn: () => void): () => void {
  startListeners.add(fn);
  return () => {
    startListeners.delete(fn);
  };
}

export function __resetScrollActivityForTests(): void {
  scrolling = false;
  settledAt = -Infinity;
  if (safety) clearTimeout(safety);
  safety = null;
  listeners.clear();
  startListeners.clear();
}
