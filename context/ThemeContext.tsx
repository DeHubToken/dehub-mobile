import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import * as SystemUI from 'expo-system-ui';
import { colorScheme, vars } from 'nativewind';
import { getAppPrefs, setAppPref, useAppPrefs } from '../hooks/useAppPrefs';
import {
  getThemeColors,
  setActiveTheme,
  type AppThemeName,
  type ThemeColors,
} from '../theme/colors';
import { getThemeSkin, type ThemeSkin } from '../theme/skins';
import { themeAccent, tintSkin, type Rgb } from '../theme/themeColor';
// Plain JS shared with the JSX runtime, which loads before any of this.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setThemePass } = require('../libs/jsx/shape') as {
  setThemePass: (square: boolean, page: string | null, classes?: boolean, surface?: string) => void;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setControlMaterial } = require('../libs/jsx/controls');

type AppThemeContextValue = {
  theme: AppThemeName;
  isLight: boolean;
  /** Web's `minimal` theme: flat black canvas, square corners, edge-to-edge media. */
  isMinimal: boolean;
  colors: ThemeColors;
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
export const SYSTEM_ROOT_VARS = vars({
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
 * What a page fill becomes under a canvas theme: its page colour, part
 * see-through, so the live backdrop shows behind every screen as it does on
 * web. A panel inside a page stacks a second veil and lands near web's glass
 * bento (~0.82).
 */
const PAGE_VEIL_ALPHA = 0.6;
export function pageVeil(hex: string): string {
  return `rgba(${hexTriplet(hex).split(' ').join(',')},${PAGE_VEIL_ALPHA})`;
}

/**
 * A canvas theme's variables: its page colour on the background tokens, and
 * War's square corners. Same keys as SYSTEM_ROOT_VARS, for the reason above.
 */
const SKIN_ROOT_VARS = new Map<AppThemeName, ReturnType<typeof vars>>();
function skinRootVars(theme: AppThemeName, skin: ThemeSkin) {
  let v = SKIN_ROOT_VARS.get(theme);
  if (!v) {
    const page = hexTriplet(skin.page);
    const r = skin.square;
    v = vars({
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
    SKIN_ROOT_VARS.set(theme, v);
  }
  return v;
}

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const prefs = useAppPrefs();
  const theme = prefs.theme;
  const colors = getThemeColors(theme);
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
  }, [skin, theme]);
  setControlMaterial(controlMaterial);

  setActiveTheme(theme);
  // Inline StyleSheet radii and near-black page fills (see libs/jsx/shape.js).
  // Set during render so the children rendered below this already see it.
  if (theme === 'minimal') setThemePass(true, '#000');
  // Pages are veiled over the backdrop; modals, sheets and pinned bars take
  // the solid page colour so nothing shows through them (libs/jsx/surface.js).
  else if (skin) setThemePass(skin.square, pageVeil(skin.page), true, skin.page);
  else setThemePass(false, null);

  useEffect(() => {
    colorScheme.set('dark');
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background, theme]);

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
      theme, isLight: false, isMinimal: theme === 'minimal', colors, skin, setTheme,
      themeHues, brandColors, setThemeHue, setBrandColors, accent,
    }),
    [colors, setTheme, skin, theme, themeHues, brandColors, setThemeHue, setBrandColors, accent],
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
  const { isMinimal, skin, theme } = useAppTheme();
  if (isMinimal) return MINIMAL_ROOT_VARS;
  return skin ? skinRootVars(theme, skin) : SYSTEM_ROOT_VARS;
}
