/**
 * Whether the screen that shows the live theme backdrop is in front.
 *
 * Only the home feed is see-through to it (see components/theme/ThemeBackdrop);
 * every other screen paints the theme's solid page colour over it. So the
 * backdrop's render loop runs while home is focused and pauses the rest of the
 * time, instead of drawing frames nobody can see.
 */
let visible = false;
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
