export type AppThemeName = 'system' | 'minimal';

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

/**
 * Web's `minimal` theme: the same monochrome app on a pure black canvas, with
 * the feed's bento cards dissolved into the page and a faint white hairline
 * doing the separating. Sheets and toasts keep the system card surface so they
 * still read as layers. Shape (square corners, edge-to-edge media) is not
 * colour — see `MINIMAL_RADIUS_VARS` and the `isMinimal` consumers.
 */
export const minimalColors: ThemeColors = {
  ...systemColors,
  background: '#000000',
  neutrals: { ...systemColors.neutrals, 900: '#000000' },
};

/** The hairline web draws between minimal feed items (index.css). */
export const MINIMAL_HAIRLINE = 'rgba(255,255,255,0.08)';
/** Baseline and active-tab outline of web's minimal "file tab" nav. */
export const MINIMAL_TAB_LINE = 'rgba(255,255,255,0.69)';

const palettes: Record<AppThemeName, ThemeColors> = {
  system: systemColors,
  minimal: minimalColors,
};

let activeTheme: AppThemeName = 'system';

export function isAppThemeName(value: unknown): value is AppThemeName {
  return value === 'system' || value === 'minimal';
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
