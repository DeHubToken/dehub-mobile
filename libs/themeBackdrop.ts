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

export function setThemeBackdropVisible(next: boolean): void {
  if (next === visible) return;
  visible = next;
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* a bad listener must not stop the rest */
    }
  });
}

export function isThemeBackdropVisible(): boolean {
  return visible;
}

export function subscribeThemeBackdrop(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
