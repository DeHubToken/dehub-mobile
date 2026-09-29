/**
 * Whether the live theme backdrop can be seen.
 *
 * Under a canvas theme every screen is see-through to it, as on web: page
 * fills become a tinted veil over the scene (libs/jsx/shape.js). So it runs
 * whenever the app is in front; a screen that covers it completely can switch
 * it off here while that screen is focused.
 */
let visible = true;
const listeners = new Set<() => void>();
const HOLD_MS = 1500;
let held = false;
let holdTimer: ReturnType<typeof setTimeout> | null = null;

export function setThemeBackdropVisible(next: boolean): void {
  if (next === visible) return;
  visible = next;
  notify();
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a bad listener must not stop the rest */
    }
  });
}

export function isThemeBackdropVisible(): boolean {
  return visible && !held;
}

/**
 * A drag on any home tab holds the scene still for a moment. Every tab reports
 * the start of a drag, but not all of them report the end of the fling that
 * follows, so the hold lapses on its own; each new drag extends it.
 */
export function holdThemeBackdrop(): void {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    holdTimer = null;
    held = false;
    notify();
  }, HOLD_MS);
  if (held) return;
  held = true;
  notify();
}

export function subscribeThemeBackdrop(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
