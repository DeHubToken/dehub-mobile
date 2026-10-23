import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import { colorScheme, vars } from 'nativewind';
import { getAppPrefs, setAppPref, useAppPrefs } from '../hooks/useAppPrefs';
import {
  effectiveTheme,
  getThemeColors,
  setActiveTheme,
  SYSTEM_LIGHT,
  type AppThemeName,
  type ThemeColors,
} from '../theme/colors';
import { getThemeSkin, type ThemeSkin } from '../theme/skins';
import { canvasPageBackground } from '../theme/pageBackground';
import { themeAccent, tintSkin, type Rgb } from '../theme/themeColor';
// Plain JS shared with the JSX runtime, which loads before any of this.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setThemePass } = require('../libs/jsx/shape') as {
  setThemePass: (square: boolean, page: string | null, classes?: boolean, surface?: string) => void;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setControlMaterial } = require('../libs/jsx/controls');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setLightTone } = require('../libs/jsx/tone') as { setLightTone: (on: boolean) => void };

type AppThemeContextValue = {
  /** The theme the app runs. System Light runs as `system`; see `themeChoice`. */
  theme: AppThemeName;
  /** The saved pick, `system-light` included. Compare this to tell System Light apart. */
  themeChoice: AppThemeName;
  /** System Light: ink on white. */
  isLight: boolean;
  /** Web's `minimal` theme: flat black canvas, square corners, edge-to-edge media. */
  isMinimal: boolean;
  /** The palette screens are written against (System's, under System Light). */
  colors: ThemeColors;
  /** The colours as they reach the screen, for what paints outside React. */
  pageColors: ThemeColors;
  /** A canvas theme's chrome (theme/skins.ts), or null for system and minimal. */
  skin: ThemeSkin | null;
  setTheme: (theme: AppThemeName) => void;
  /** Theme Color per customisable theme (theme/themeColor.ts), and the Brand palette. */
  themeHues: Record<string, number>;
  brandColors: string[];
  /** Set a theme's colour; null goes back to the theme's own. */
  setThemeHue: (theme: string, value: number | null) => void;
  setBrandColors: (colors: string[]) => void;
  /** The colour the theme's glass is tinted with, following Theme Color. */
  accent: Rgb;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

/**
 * Minimal squares off everything, same as web's
 * `html[data-theme="minimal"] * { border-radius: 0 }`. Every `rounded-*` class
 * reads its radius from these variables (tailwind.config.js, defaults in
 * global.css), so setting them at the root reaches every screen, sheet and
 * modal without touching the ~1000 call sites. The canvas goes pure black
 * with it, as web's does.
 */
/**
 * The system values of the same variables (global.css :root). The root sets
 * variables in BOTH themes on purpose: NativeWind treats a component that
 * starts setting variables after its first render as a structural change and
 * remounts it — at the root that is the whole app, auth and navigator
 * included, which left it stuck behind the black boot cover. Setting them from
 * the first frame means a theme switch only changes values.
 */
/**
 * The colour variables every `text-white`, `bg-black`, `bg-zinc-*` and
 * `border-white/10` class reads (tailwind.config.js, defaults in global.css).
 * Dark in every theme but System Light, which turns them around at the root
 * so ~1700 class names read as ink on white without touching them. Media and
 * camera surfaces put the dark values back (`.dark-surface`, global.css).
 */
const DARK_COLOR_VARS = {
  '--color-black': '0 0 0',
  '--color-white': '255 255 255',
  '--color-zinc-50': '250 250 250',
  '--color-zinc-100': '244 244 245',
  '--color-zinc-200': '228 228 231',
  '--color-zinc-300': '212 212 216',
  '--color-zinc-400': '161 161 170',
  '--color-zinc-500': '128 128 137',
  '--color-zinc-600': '82 82 91',
  '--color-zinc-700': '63 63 70',
  '--color-zinc-800': '39 39 42',
  '--color-zinc-900': '24 24 27',
  '--color-theme-neutrals-50': '250 250 250',
  '--color-theme-neutrals-100': '249 251 255',
  '--color-theme-neutrals-200': '221 224 227',
  '--color-theme-neutrals-300': '194 196 199',
  '--color-theme-neutrals-400': '166 169 172',
  '--color-theme-neutrals-500': '139 141 144',
  '--color-theme-neutrals-600': '111 113 116',
  '--color-theme-neutrals-700': '56 58 61',
  '--color-theme-neutrals-800': '29 31 33',
  '--color-theme-accent': '244 244 245',
  '--color-theme-accent-foreground': '9 9 11',
  '--color-theme-accent-secondary': '161 161 170',
};

/** System Light's values for the same keys: ink #0B0B0D on white. */
// Greys 300-600 are text greys in the dark-written screens; in light they sit
// at 7:1+ on white (AAA), darkest first so the dark theme's order holds.
export const SYSTEM_LIGHT_ROOT_VARS = vars({
  '--radius-sm': 4,
  '--radius': 3.5,
  '--radius-md': 6,
  '--radius-lg': 8,
  '--radius-xl': 10.5,
  '--radius-2xl': 14,
  '--radius-3xl': 21,
  '--radius-full': 9999,
  '--color-theme-background': '255 255 255',
  '--color-theme-neutrals-900': '255 255 255',
  '--color-zinc-950': '255 255 255',
  '--color-black': '255 255 255',
  '--color-white': '11 11 13',
  '--color-zinc-50': '11 11 13',
  '--color-zinc-100': '24 24 27',
  '--color-zinc-200': '39 39 42',
  '--color-zinc-300': '52 52 58',
  '--color-zinc-400': '60 60 66',
  '--color-zinc-500': '68 68 74',
  '--color-zinc-600': '76 76 82',
  '--color-zinc-700': '228 228 231',
  '--color-zinc-800': '239 239 241',
  '--color-zinc-900': '244 244 246',
  '--color-theme-neutrals-50': '11 11 13',
  '--color-theme-neutrals-100': '24 24 27',
  '--color-theme-neutrals-200': '39 39 42',
  '--color-theme-neutrals-300': '52 52 58',
  '--color-theme-neutrals-400': '60 60 66',
  '--color-theme-neutrals-500': '68 68 74',
  '--color-theme-neutrals-600': '76 76 82',
  '--color-theme-neutrals-700': '228 228 231',
  '--color-theme-neutrals-800': '244 244 245',
  '--color-theme-accent': '11 11 13',
  '--color-theme-accent-foreground': '255 255 255',
  '--color-theme-accent-secondary': '63 63 70',
});

export const SYSTEM_ROOT_VARS = vars({
  ...DARK_COLOR_VARS,
  '--radius-sm': 4,
  '--radius': 3.5,
  '--radius-md': 6,
  '--radius-lg': 8,
  '--radius-xl': 10.5,
  '--radius-2xl': 14,
  '--radius-3xl': 21,
  '--radius-full': 9999,
  '--color-theme-background': '1 3 5',
  '--color-theme-neutrals-900': '1 3 5',
  '--color-zinc-950': '9 9 11',
});

export const MINIMAL_ROOT_VARS = vars({
  ...DARK_COLOR_VARS,
  '--radius-sm': 0,
  '--radius': 0,
  '--radius-md': 0,
  '--radius-lg': 0,
  '--radius-xl': 0,
  '--radius-2xl': 0,
  '--radius-3xl': 0,
  '--radius-full': 0,
  '--color-theme-background': '0 0 0',
  '--color-theme-neutrals-900': '0 0 0',
  '--color-zinc-950': '0 0 0',
});

/** "#0A0812" -> "10 8 18", the form the colour variables take. */
function hexTriplet(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * A canvas theme's variables: its page colour on the background tokens, and
 * War's square corners. Same keys as SYSTEM_ROOT_VARS, for the reason above.
 */
const SKIN_ROOT_VARS = new Map<string, ReturnType<typeof vars>>();
function skinRootVars(theme: AppThemeName, skin: ThemeSkin) {
  const key = `${theme}:${skin.page}`;
  let v = SKIN_ROOT_VARS.get(key);
  if (!v) {
    const page = hexTriplet(skin.page);
    const r = skin.square;
    v = vars({
      ...DARK_COLOR_VARS,
      '--radius-sm': r ? 0 : 4,
      '--radius': r ? 0 : 3.5,
      '--radius-md': r ? 0 : 6,
      '--radius-lg': r ? 0 : 8,
      '--radius-xl': r ? 0 : 10.5,
      '--radius-2xl': r ? 0 : 14,
      '--radius-3xl': r ? 0 : 21,
      '--radius-full': r ? 0 : 9999,
      '--color-theme-background': page,
      '--color-theme-neutrals-900': page,
      '--color-zinc-950': page,
    });
    if (SKIN_ROOT_VARS.size > 40) SKIN_ROOT_VARS.clear();
    SKIN_ROOT_VARS.set(key, v);
  }
  return v;
}

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const prefs = useAppPrefs();
  const themeChoice = prefs.theme;
  const theme = effectiveTheme(themeChoice);
  const isLight = themeChoice === SYSTEM_LIGHT;
  // Screens are written against the dark palette and System Light turns its
  // greys around as they render (libs/jsx/tone.js), so they get System's
  // colours here. `pageColors` is for what paints outside React: the status
  // bar, the window behind the app, the navigator's theme.
  const colors = getThemeColors(theme);
  const pageColors = getThemeColors(themeChoice);
  const { themeHues, brandColors } = prefs;
  const accent = useMemo(() => themeAccent(theme, themeHues, brandColors), [theme, themeHues, brandColors]);
  const accentKey = accent.join(',');
  const baseSkin = getThemeSkin(theme);
  // Theme tint: the pills and cards take the theme's colour (web #2088). One
  // object per theme + colour, so the surfaces setControlMaterial owns keep
  // their identity between renders.
  const skin = useMemo(() => (baseSkin ? tintSkin(baseSkin, accent) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseSkin, accentKey]);

  const controlMaterial = useMemo(() => skin ? {
    surface: skin.centre,
    foreground: skin.centreIcon,
    ownedSurfaces: [skin.card, skin.strip, skin.stripActive, skin.barFill, skin.barBorder],
  } : isLight ? {
    // Written dark like everything else and turned around by the tone pass:
    // a faint ink wash with a hairline rim, where System's glass would come
    // out as a heavy mid-grey slab on white.
    surface: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      borderTopColor: 'rgba(255,255,255,0.14)',
      borderRadius: 12,
    },
    foreground: '#FFFFFF',
    ownedSurfaces: [],
  } : {
    surface: {
      backgroundColor: theme === 'minimal' ? '#000' : 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      borderColor: theme === 'minimal' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.30)',
      borderTopColor: theme === 'minimal' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.45)',
      borderRadius: theme === 'minimal' ? 0 : 12,
    },
    foreground: '#FFFFFF',
    ownedSurfaces: [],
  }, [skin, theme, isLight]);
  setControlMaterial(controlMaterial);

  setActiveTheme(theme, themeChoice);
  setLightTone(isLight);
  // Inline StyleSheet radii and near-black page fills (see libs/jsx/shape.js).
  // Set during render so the children rendered below this already see it.
  if (theme === 'minimal') setThemePass(true, '#000');
  // Android page wrappers stay clear, so nested headers and lists cannot
  // stack dark rectangles over the scene. Cards keep their own materials;
  // modal surfaces retain their solid fill (libs/jsx/surface.js).
  else if (skin) setThemePass(skin.square, skin.material === 'glass' ? 'transparent' : canvasPageBackground(skin.page, Platform.OS), true, skin.page);
  else setThemePass(false, null);

  useEffect(() => {
    colorScheme.set(isLight ? 'light' : 'dark');
    SystemUI.setBackgroundColorAsync(pageColors.background).catch(() => {});
  }, [pageColors.background, theme, isLight]);

  const setTheme = useCallback((nextTheme: AppThemeName) => {
    setAppPref('theme', nextTheme);
  }, []);

  const setThemeHue = useCallback((name: string, next: number | null) => {
    const current = { ...getAppPrefs().themeHues };
    if (next === null) delete current[name];
    else current[name] = next < 0 ? Math.round(next) : ((Math.round(next) % 360) + 360) % 360;
    setAppPref('themeHues', current);
  }, []);

  const setBrandColors = useCallback((next: string[]) => {
    setAppPref('brandColors', next.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3));
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({
      theme, themeChoice, isLight, isMinimal: theme === 'minimal', colors, pageColors, skin, setTheme,
      themeHues, brandColors, setThemeHue, setBrandColors, accent,
    }),
    [colors, pageColors, setTheme, skin, theme, themeChoice, isLight, themeHues, brandColors, setThemeHue, setBrandColors, accent],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used within AppThemeProvider');
  return value;
}

/** Style for the app's root view: always a set of variables — see SYSTEM_ROOT_VARS. */
export function useThemeRootStyle() {
  const { isMinimal, isLight, skin, theme } = useAppTheme();
  if (isMinimal) return MINIMAL_ROOT_VARS;
  if (isLight) return SYSTEM_LIGHT_ROOT_VARS;
  return skin ? skinRootVars(theme, skin) : SYSTEM_ROOT_VARS;
}
