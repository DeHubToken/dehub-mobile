/**
 * Every theme the app can run, in the order Settings lists them. `system` and
 * `minimal` are drawn by the app itself; the rest are web's canvas themes,
 * whose live backgrounds run behind the app (components/theme/ThemeBackdrop)
 * and whose surfaces come from theme/skins.ts.
 */
export const APP_THEMES = [
  'system',
  'system-light',
  'immersive',
  'minimal',
  'glass',
  'cosmic',
  'hazy',
  'swarms',
  'lavalamp',
  'winter',
  'war',
  'osaka',
  'jungle',
  'island',
  'hacker',
  'horror',
] as const;

export type AppThemeName = (typeof APP_THEMES)[number];

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

/**
 * System Light: System's layout in daylight. White page, ink text, posts edge
 * to edge with ink hairlines (web styles/system-light.css). The app runs it as
 * `system` (ThemeContext `theme`), with `themeChoice` and `isLight` telling the
 * two apart, so every System layout branch still applies.
 */
export const SYSTEM_LIGHT = 'system-light' as const;
export const systemLightColors: ThemeColors = {
  background: '#FFFFFF',
  foreground: '#0B0B0D',
  card: '#F4F4F6',
  cardForeground: '#0B0B0D',
  border: 'rgba(11,11,13,0.09)',
  accent: '#0B0B0D',
  accentSecondary: '#71717A',
  accentForeground: '#FFFFFF',
  muted: '#F4F4F5',
  mutedForeground: 'rgba(11,11,13,0.62)',
  destructive: '#0B0B0D',
  destructiveForeground: '#FFFFFF',
  success: '#0B0B0D',
  neutrals: {
    50: '#0B0B0D',
    100: '#18181B',
    200: '#27272A',
    300: '#3F3F46',
    400: '#71717A',
    500: '#8B8D90',
    600: '#A1A1AA',
    700: '#E4E4E7',
    800: '#F4F4F5',
    900: '#FFFFFF',
  },
};

/** The theme the app runs a saved choice as: System Light is System in light colours. */
export function effectiveTheme(choice: AppThemeName): AppThemeName {
  return choice === SYSTEM_LIGHT ? 'system' : choice;
}

/** The hairline web draws between minimal feed items (index.css). */
export const MINIMAL_HAIRLINE = 'rgba(255,255,255,0.08)';
/** Baseline and active-tab outline of web's minimal "file tab" nav. */
export const MINIMAL_TAB_LINE = 'rgba(255,255,255,0.69)';

/**
 * A canvas theme's palette. `background` is its solid page colour — what the
 * status bar, every pushed screen and every sheet paint, since only the home
 * feed is see-through to the live backdrop. Values follow dehubweb's theme
 * tokens (styles/war-frame.css, osaka-frame.css, jungle-frame.css).
 */
function canvasColors(page: string, overrides: Partial<ThemeColors> = {}): ThemeColors {
  return {
    ...systemColors,
    background: page,
    card: '#121216',
    border: '#2A2A30',
    ...overrides,
    neutrals: { ...systemColors.neutrals, 900: page },
  };
}

export const cosmicColors = canvasColors('#040407');
export const hazyColors = canvasColors('#0A0714', { card: '#16112A', border: '#2C2345' });
export const swarmsColors = canvasColors('#03080D', { card: '#0C1822', border: '#1C3242' });
export const lavalampColors = canvasColors('#120704', { card: '#221009', border: '#3A1E12' });
export const winterColors = canvasColors('#05070A', { card: '#0F141B', border: '#223040' });
export const warColors = canvasColors('#060A09', {
  foreground: '#FFFFFF',
  card: '#0E1412',
  border: '#1F5F5E',
  accent: '#4FE3E0',
  accentForeground: '#060A09',
  mutedForeground: '#C5BA9C',
});
export const osakaColors = canvasColors('#0A0812', {
  foreground: '#ECE9F5',
  cardForeground: '#ECE9F5',
  card: '#110E1C',
  border: '#2A2438',
  accent: '#FF6FB5',
  accentForeground: '#0A0812',
  mutedForeground: '#B0AAC4',
});
export const jungleColors = canvasColors('#16110C', {
  foreground: '#F6F0E3',
  cardForeground: '#F6F0E3',
  card: '#261C13',
  border: '#3A2B1C',
  accent: '#E2B060',
  accentForeground: '#16110C',
  mutedForeground: '#C6B69E',
});

// The three 2D-canvas themes (web IslandBackground / HackerBackground /
// HorrorBackground): a lagoon that follows the clock, green rain, VHS tape.
export const islandColors = canvasColors('#1A2A4A', {
  card: '#1E2F52',
  border: '#3A4F80',
  accent: '#FF7A8A',
  accentForeground: '#1A2A4A',
});
export const hackerColors = canvasColors('#000000', {
  card: '#020A05',
  border: '#0E4A26',
  accent: '#39FF88',
  accentForeground: '#000000',
  mutedForeground: '#7FD9A6',
});
export const horrorColors = canvasColors('#0B0C0D', {
  card: '#121315',
  border: '#2A2C2F',
  accent: '#FF2B2B',
  accentForeground: '#FFFFFF',
});

const palettes: Record<AppThemeName, ThemeColors> = {
  system: systemColors,
  'system-light': systemLightColors,
  immersive: systemColors,
  minimal: minimalColors,
  glass: canvasColors('#082a30', { card: '#103940', border: 'rgba(225,255,255,0.4)', accent: '#d7ffff' }),
  cosmic: cosmicColors,
  hazy: hazyColors,
  swarms: swarmsColors,
  lavalamp: lavalampColors,
  winter: winterColors,
  war: warColors,
  osaka: osakaColors,
  jungle: jungleColors,
  island: islandColors,
  hacker: hackerColors,
  horror: horrorColors,
};

let activeTheme: AppThemeName = 'system';
let activeChoice: AppThemeName = 'system';

export function isAppThemeName(value: unknown): value is AppThemeName {
  return typeof value === 'string' && (APP_THEMES as readonly string[]).includes(value);
}

export function getThemeColors(name: AppThemeName): ThemeColors {
  return palettes[name];
}

/** `name` is the theme the app runs; `choice` the saved pick (System Light runs as System). */
export function setActiveTheme(name: AppThemeName, choice: AppThemeName = name): void {
  activeTheme = name;
  activeChoice = choice;
}

/** Whether the saved pick is System Light, for leaf components outside React context. */
export function isLightTone(): boolean {
  return activeChoice === SYSTEM_LIGHT;
}

/** The theme ThemeContext last rendered, for leaf components outside React context. */
export function getActiveTheme(): AppThemeName {
  return activeTheme;
}

/**
 * Backwards-compatible live palette for existing `theme.colors` imports.
 * Render-time reads follow the active theme while runtime NativeWind classes
 * are driven by the matching CSS variables in global.css.
 */
export const colors = new Proxy(systemColors, {
  get: (_target, property) => Reflect.get(palettes[activeTheme], property),
}) as ThemeColors;

/**
 * System Light's white, for fills that reach a View through a library
 * (navigator options) or are meant to stay white. Written as hsla() because
 * that is the colour pass's own output (libs/jsx/tone.js), which it never
 * turns around; a plain '#FFFFFF' there comes out as ink.
 */
export const LIGHT_PAGE_FILL = 'hsla(0,0%,100%,1)';
