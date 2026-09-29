import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import * as SystemUI from 'expo-system-ui';
import { colorScheme, vars } from 'nativewind';
import { setAppPref, useAppPrefs } from '../hooks/useAppPrefs';
import {
  getThemeColors,
  setActiveTheme,
  type AppThemeName,
  type ThemeColors,
} from '../theme/colors';
import { getThemeSkin, type ThemeSkin } from '../theme/skins';
// Plain JS shared with the JSX runtime, which loads before any of this.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setThemePass } = require('../libs/jsx/shape') as {
  setThemePass: (square: boolean, page: string | null, classes?: boolean, surface?: string) => void;
};

type AppThemeContextValue = {
  theme: AppThemeName;
  isLight: boolean;
  /** Web's `minimal` theme: flat black canvas, square corners, edge-to-edge media. */
  isMinimal: boolean;
  colors: ThemeColors;
  /** A canvas theme's chrome (theme/skins.ts), or null for system and minimal. */
  skin: ThemeSkin | null;
  setTheme: (theme: AppThemeName) => void;
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
  const skin = getThemeSkin(theme);

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

  const value = useMemo<AppThemeContextValue>(
    () => ({ theme, isLight: false, isMinimal: theme === 'minimal', colors, skin, setTheme }),
    [colors, setTheme, skin, theme],
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
