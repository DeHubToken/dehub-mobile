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
// Plain JS shared with the JSX runtime, which loads before any of this.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { setSquaring } = require('../libs/jsx/shape') as { setSquaring: (on: boolean) => void };

type AppThemeContextValue = {
  theme: AppThemeName;
  isLight: boolean;
  /** Web's `minimal` theme: flat black canvas, square corners, edge-to-edge media. */
  isMinimal: boolean;
  colors: ThemeColors;
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

export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const prefs = useAppPrefs();
  const theme = prefs.theme;
  const colors = getThemeColors(theme);

  setActiveTheme(theme);
  // Inline StyleSheet radii (see libs/jsx/shape.js). Set during render so the
  // children rendered below this already see it.
  setSquaring(theme === 'minimal');

  useEffect(() => {
    colorScheme.set('dark');
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background, theme]);

  const setTheme = useCallback((nextTheme: AppThemeName) => {
    setAppPref('theme', nextTheme);
  }, []);

  const value = useMemo<AppThemeContextValue>(
    () => ({ theme, isLight: false, isMinimal: theme === 'minimal', colors, setTheme }),
    [colors, setTheme, theme],
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
  const { isMinimal } = useAppTheme();
  return isMinimal ? MINIMAL_ROOT_VARS : SYSTEM_ROOT_VARS;
}
