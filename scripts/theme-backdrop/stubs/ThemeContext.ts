// dehubweb's ThemeContext, reduced to what the background components read.
// The theme comes from the page hash (see ../entry.tsx). The Theme Color and
// Brand palette come from the app: ThemeBackdrop names them in
// window.__BACKDROP_HUES / __BACKDROP_BRAND before the page loads, and changes
// them live through window.dehubBackdrop.setColors(), which re-renders the
// scene with the new colour instead of reloading it.
import { useSyncExternalStore } from 'react';

export const DEFAULT_THEME_HUES: Record<string, number> = { cosmic: -1, hazy: 260, swarms: 200, lavalamp: 20 };

type Colors = { themeHues: Record<string, number>; brandColors: string[] };

const w = window as unknown as Record<string, unknown>;
let colors: Colors = {
  themeHues: { ...DEFAULT_THEME_HUES, ...((w.__BACKDROP_HUES as Record<string, number>) || {}) },
  brandColors: (w.__BACKDROP_BRAND as string[]) || [],
};
const listeners = new Set<() => void>();

export function setBackdropColors(themeHues: Record<string, number>, brandColors: string[]) {
  colors = { themeHues: { ...DEFAULT_THEME_HUES, ...(themeHues || {}) }, brandColors: brandColors || [] };
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppTheme() {
  const current = useSyncExternalStore(subscribe, () => colors);
  return {
    theme: w.__THEME as string,
    themeHues: current.themeHues,
    brandColors: current.brandColors,
    dimLights: false,
    dimStrength: 50,
  };
}
