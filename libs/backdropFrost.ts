import { useSyncExternalStore } from 'react';
import { makeMutable } from 'react-native-reanimated';

/**
 * The frosted copy of the theme wallpaper that feed cards paint behind
 * themselves. The backdrop WebView posts it (libs/backdropFrostScript.ts);
 * every card reads the same picture, so there is one blur for the whole feed
 * instead of a live blur per card (Android has no cheap live blur, and a 3D
 * scene already shares the GPU with a fling).
 *
 * Kill switch: FROST_ENABLED = false puts every card back on its plain tint.
 */
export const FROST_ENABLED = true;

type Frost = { uri: string; width: number; height: number } | null;

let frost: Frost = null;
let size = { width: 0, height: 0 };
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

/** Bumped every frame while a feed moves, so each card re-reads its spot. */
export const frostClock = makeMutable(0);

export function setBackdropFrost(uri: string | null): void {
  const next: Frost = FROST_ENABLED && uri && size.width > 0 ? { uri, ...size } : null;
  if (next?.uri === frost?.uri && next?.width === frost?.width && next?.height === frost?.height) return;
  frost = next;
  notify();
}

/** The backdrop's own size: the picture covers exactly this area. */
export function setBackdropFrostSize(width: number, height: number): void {
  if (width === size.width && height === size.height) return;
  size = { width, height };
  if (frost) { frost = { ...frost, width, height }; notify(); }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getBackdropFrost(): Frost {
  return frost;
}

export function useBackdropFrost(): Frost {
  return useSyncExternalStore(subscribe, getBackdropFrost, getBackdropFrost);
}

/** `rgba(r,g,b,a)` with its alpha scaled, for the veil over the frost. */
export function scaleAlpha(color: unknown, factor: number): string | undefined {
  if (typeof color !== 'string') return undefined;
  const m = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) return color;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]);
  return `rgba(${m[1]},${m[2]},${m[3]},${Math.round(a * factor * 1000) / 1000})`;
}
