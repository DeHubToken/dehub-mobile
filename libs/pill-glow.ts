import type { AppThemeName } from '../theme/colors';
import type { Rgb } from '../theme/themeColor';
import { PULL_REFRESH_THRESHOLD } from './pill-pull-motion';

/** Light the tab pill's underside in the theme's own colour, as web does.
 *  System keeps the immersive rim's cool white; Minimal is a softer white. */
export function pillGlowColor(theme: AppThemeName, accent: Rgb, light = false): { color: Rgb; gain: number } {
  // Light is lost on a white page: System Light casts an ink shade instead.
  if (light) return { color: [11, 11, 13], gain: .7 };
  if (theme === 'system') return { color: [228, 240, 255], gain: 1 };
  if (theme === 'minimal') return { color: [255, 255, 255], gain: .6 };
  return { color: accent.map((v, i) => Math.round(v * .6 + [240, 246, 255][i] * .4)) as Rgb, gain: 1 };
}

/** 0 to 1: follows the pull up to the refresh point, then the quiet breath while refreshing. */
export function pillGlowStrength(distance: number, breath: number) {
  'worklet';
  return Math.max(Math.min(1, Math.max(0, distance) / PULL_REFRESH_THRESHOLD), breath);
}
