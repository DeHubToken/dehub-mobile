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
let safety: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const startListeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => fn());
}

export function isFeedScrolling(): boolean {
  return scrolling;
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
        notify();
      }
    }, SAFETY_MS);
    return;
  }
  if (!scrolling) return;
  scrolling = false;
  notify();
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
  if (safety) clearTimeout(safety);
  safety = null;
  listeners.clear();
  startListeners.clear();
}
