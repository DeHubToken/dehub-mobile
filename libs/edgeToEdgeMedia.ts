import { useSyncExternalStore } from "react";

/**
 * Whether a full-bleed media screen (Shorts viewer, image feed) is on top.
 * App drops the window's top safe-area edge for it, which would also pull the
 * screen underneath up under the status bar. That screen shows through the
 * viewer during a drag to close, so it pads itself back down by the same
 * amount and stays exactly where it was left.
 */
let current = false;
const listeners = new Set<() => void>();

export function setEdgeToEdgeMedia(next: boolean) {
  if (next === current) return;
  current = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useEdgeToEdgeMedia() {
  return useSyncExternalStore(subscribe, () => current, () => false);
}
