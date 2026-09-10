export type AppThemeName = 'system';

export type ThemeColors = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  border: string;
  accent: string;
  accentSecondary: string;
  accentForeground: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  neutrals: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;
};

/** The existing mobile look. Web calls this theme `system`. */
export const systemColors: ThemeColors = {
  background: '#010305',
  foreground: '#FFFFFF',
  card: '#1C1C1C',
  cardForeground: '#FFFFFF',
  border: '#333333',
  accent: '#F4F4F5',
  accentSecondary: '#A1A1AA',
  accentForeground: '#09090B',
  muted: '#2F2F2F',
  mutedForeground: '#AAAAAA',
  destructive: '#F4F4F5',
  destructiveForeground: '#FFFFFF',
  success: '#F4F4F5',
  neutrals: {
    50: '#FAFAFA',
    100: '#F9FBFF',
    200: '#DDE0E3',
    300: '#C2C4C7',
    400: '#A6A9AC',
    500: '#8B8D90',
    600: '#6F7174',
    700: '#383A3D',
    800: '#1D1F21',
    900: '#010305',
  },
};

const palettes: Record<AppThemeName, ThemeColors> = {
  system: systemColors,
};

let activeTheme: AppThemeName = 'system';

export function isAppThemeName(value: unknown): value is AppThemeName {
  return value === 'system';
}

export function getThemeColors(name: AppThemeName): ThemeColors {
  return palettes[name];
}

export function setActiveTheme(name: AppThemeName): void {
  activeTheme = name;
}

/**
 * Backwards-compatible live palette for existing `theme.colors` imports.
 * Render-time reads follow the active theme while runtime NativeWind classes
 * are driven by the matching CSS variables in global.css.
 */
export const colors = new Proxy(systemColors, {
  get: (_target, property) => Reflect.get(palettes[activeTheme], property),
}) as ThemeColors;
