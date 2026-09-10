import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import * as SystemUI from 'expo-system-ui';
import { colorScheme } from 'nativewind';
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
  colors: ThemeColors;
  setTheme: (theme: AppThemeName) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

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
    () => ({ theme, isLight: false, colors, setTheme }),
    [colors, setTheme, theme],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export function useAppTheme(): AppThemeContextValue {
  const value = useContext(AppThemeContext);
  if (!value) throw new Error('useAppTheme must be used within AppThemeProvider');
  return value;
}
