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

/** Style for the app's root view: the minimal variables, or nothing. */
export function useThemeRootStyle() {
  const { isMinimal } = useAppTheme();
  return isMinimal ? MINIMAL_ROOT_VARS : undefined;
}
