import type { ViewStyle } from 'react-native';
import type { AppThemeName } from './colors';
import type { ThemeSkin } from './skins';

/**
 * Theme Color: the colour picked for a customisable canvas theme, stored as
 * one number per theme exactly as web stores it (dehubweb
 * src/lib/theme-color.ts, key `dehub.themeHues`):
 *
 *   0–359 → a hue on the slider
 *   -1    → White   -2 → Black   -3 → Rainbow
 *   -4    → Brand (a gradient of the profile picture's colours)
 */
export const THEME_COLOR = {
  WHITE: -1,
  BLACK: -2,
  RAINBOW: -3,
  BRAND: -4,
} as const;

/** What each customisable theme ships with. Same values as web. */
export const DEFAULT_THEME_HUES: Record<string, number> = {
  cosmic: THEME_COLOR.WHITE,
  hazy: 260,
  swarms: 200,
  lavalamp: 20,
};

export function hasThemeColor(theme: AppThemeName): boolean {
  return theme in DEFAULT_THEME_HUES;
}

export type Rgb = [number, number, number];

/** Each theme's own colour, which its glass is tinted with (web: --tint-accent). */
const THEME_ACCENTS: Partial<Record<AppThemeName, Rgb>> = {
  winter: [150, 190, 230],
  war: [79, 227, 224],
  osaka: [255, 111, 181],
  jungle: [132, 190, 60],
  island: [34, 170, 200],
  hacker: [57, 255, 136],
  horror: [214, 190, 150],
};

const NEUTRAL: Rgb = [200, 196, 220];

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  if (s === 0) return [l * 255, l * 255, l * 255].map(Math.round) as Rgb;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map((c) => Math.round(c * 255)) as Rgb;
}

export function hexToRgb(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

export function hueToHex(hue: number): string {
  return `#${hslToRgb(hue / 360, 0.7, 0.55).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** "#aabbcc" or "abc" → hue 0–359, or null when it is not a colour. Greys give 0. */
export function hexToHue(input: string): number | null {
  const rgb = hexToRgb(input);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round((((h * 60) % 360) + 360) % 360) % 360;
}

/** Same colour web's glass takes for a stored Theme Color value (themeTintAccent). */
export function themeColorAccent(value: number, brandColors: string[] = []): Rgb {
  switch (value) {
    case THEME_COLOR.WHITE:
      return [220, 220, 232];
    case THEME_COLOR.BLACK:
      return [40, 40, 46];
    case THEME_COLOR.RAINBOW:
      return NEUTRAL;
    case THEME_COLOR.BRAND:
      return brandColors.map(hexToRgb).find((c): c is Rgb => c !== null) ?? NEUTRAL;
    default: {
      const hue = ((Math.round(value) % 360) + 360) % 360;
      return hslToRgb(hue / 360, 0.7, 0.55);
    }
  }
}

/** The colour the active theme's glass is tinted with, following its Theme Color. */
export function themeAccent(theme: AppThemeName, hues: Record<string, number>, brandColors: string[]): Rgb {
  if (hasThemeColor(theme)) return themeColorAccent(hues[theme] ?? DEFAULT_THEME_HUES[theme], brandColors);
  return THEME_ACCENTS[theme] ?? [161, 161, 170];
}

function parseRgb(color: unknown): Rgb {
  const m = String(color ?? '').match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [9, 9, 11];
}

const mix = (a: Rgb, b: Rgb, p: number): Rgb => a.map((v, i) => Math.round(v * (1 - p) + b[i] * p)) as Rgb;
const rgba = (c: Rgb, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const WHITE: Rgb = [255, 255, 255];

/**
 * Theme tint (web #2088): the tab pill, the bottom nav and the post cards take
 * the theme's colour instead of near-black. The pills stay solid, as Android
 * draws them (iOS lays its own thin wash of this colour over a real blur);
 * cards keep their see-through veil but lighter and tinted.
 */
export function tintSkin(skin: ThemeSkin, accent: Rgb): ThemeSkin {
  const base = parseRgb(skin.card.backgroundColor);
  const pill = mix(mix(base, accent, 0.22), WHITE, 0.06);
  const card = mix(mix(base, accent, 0.28), WHITE, 0.04);
  const withFill = (style: ViewStyle, color: string): ViewStyle => ({ ...style, backgroundColor: color });
  return {
    ...skin,
    card: withFill(skin.card, rgba(card, 0.7)),
    centre: {
      ...skin.card,
      backgroundColor: rgba(card, 0.7),
      borderRadius: skin.centre.borderRadius,
    },
    strip: withFill(skin.strip, rgba(pill, 1)),
    barFill: withFill(skin.barFill, rgba(pill, 1)),
  };
}
