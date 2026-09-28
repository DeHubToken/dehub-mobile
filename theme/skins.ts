import type { ViewStyle } from 'react-native';
import type { AppThemeName } from './colors';

/**
 * How web's canvas themes dress the app's chrome. `system` and `minimal` have
 * no skin — they keep their own code paths — so every consumer reads
 * `getThemeSkin(theme)` and falls through to its existing styles on null.
 *
 * Values are the computed styles of the same surfaces on dehub.io at phone
 * width: the feed bento (`[data-feed-item]`), the feed nav pill, the bottom
 * nav pill and its centre button. React Native has no inset box-shadow, so
 * web's lit top edge and inner outline become a top border colour and a
 * border.
 */
export interface ThemeSkin {
  /** Web runs a live canvas behind this theme; the home feed shows it. */
  backdrop: true;
  /** Solid page colour. Near-black screen fills become this (libs/jsx/shape.js). */
  page: string;
  /** Every corner square, as War draws it. */
  square: boolean;
  /** The band behind the home header and feed tabs, over the backdrop. */
  header: ViewStyle;
  /** Feed post bento. */
  card: ViewStyle;
  /** Feed tab strip, and the tile that slides under the active tab. */
  strip: ViewStyle;
  stripActive: ViewStyle;
  tabIcon: string;
  tabIconActive: string;
  /** Bottom nav pill: its fill, its outline, and the centre (+) button. */
  barFill: ViewStyle;
  barBorder: ViewStyle;
  centre: ViewStyle;
  centreIcon: string;
  barIcon: string;
  barIconActive: string;
  /** Wood grain over surfaces (Jungle). */
  grain: boolean;
  /** Glow on the active tab and the centre button (War, Osaka), or null. */
  glow: string | null;
  /** HUD corner brackets on the tab strip and bottom nav (War), or null. */
  brackets: string | null;
  /** Post titles, captions and counts set in monospace, as War sets them. */
  mono: boolean;
}

/** War's readout type (web: ui-monospace, 0.1em tracking). */
export const MONO_TEXT = { fontFamily: 'monospace', letterSpacing: 1.2 } as const;

/** Cosmic, Hazy Nights, Swarms, Lava Lamp and Winter share one smoked glass. */
const glass: Omit<ThemeSkin, 'page'> = {
  backdrop: true,
  square: false,
  header: { backgroundColor: 'rgba(0,0,0,0.5)' },
  card: {
    backgroundColor: 'rgba(9,9,11,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderTopColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
  },
  strip: {
    backgroundColor: 'rgba(9,9,11,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  stripActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
  },
  tabIcon: '#A1A1AA',
  tabIconActive: '#FFFFFF',
  barFill: { backgroundColor: 'rgba(9,9,11,0.86)' },
  barBorder: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 16 },
  centre: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    borderRadius: 12,
  },
  centreIcon: '#FFFFFF',
  barIcon: 'rgba(255,255,255,0.72)',
  barIconActive: '#FFFFFF',
  grain: false,
  glow: null,
  brackets: null,
  mono: false,
};

const HUD = 'rgb(79,227,224)';
const RAIN = 'rgb(57,255,136)';
const SAKURA = 'rgb(255,111,181)';

const SKINS: Partial<Record<AppThemeName, ThemeSkin>> = {
  cosmic: { ...glass, page: '#040407' },
  hazy: { ...glass, page: '#0A0714' },
  swarms: { ...glass, page: '#03080D' },
  lavalamp: { ...glass, page: '#120704' },
  winter: { ...glass, page: '#05070A' },
  island: { ...glass, page: '#1A2A4A' },
  horror: { ...glass, page: '#0B0C0D' },

  // Terminal: black panels ringed in rain green, square corners, monospace.
  hacker: {
    backdrop: true,
    page: '#000000',
    square: true,
    header: { backgroundColor: 'rgba(0,0,0,0.6)' },
    card: {
      backgroundColor: 'rgba(0,8,3,0.86)',
      borderWidth: 1,
      borderColor: 'rgba(57,255,136,0.30)',
      borderTopColor: 'rgba(57,255,136,0.45)',
      borderRadius: 0,
    },
    strip: {
      backgroundColor: 'rgba(0,8,3,0.9)',
      borderWidth: 1,
      borderColor: 'rgba(57,255,136,0.30)',
      borderRadius: 0,
    },
    stripActive: {
      backgroundColor: 'rgba(57,255,136,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(57,255,136,0.6)',
      borderRadius: 0,
    },
    tabIcon: 'rgb(120,200,150)',
    tabIconActive: RAIN,
    barFill: { backgroundColor: 'rgba(0,8,3,0.9)' },
    barBorder: { borderWidth: 1, borderColor: 'rgba(57,255,136,0.4)', borderRadius: 0 },
    centre: {
      backgroundColor: 'rgba(57,255,136,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(57,255,136,0.8)',
      borderRadius: 0,
    },
    centreIcon: RAIN,
    barIcon: 'rgba(180,255,210,0.75)',
    barIconActive: RAIN,
    grain: false,
    glow: RAIN,
    brackets: null,
    mono: true,
  },

  // Tactical HUD: one cyan accent, sand readouts, square everything.
  war: {
    backdrop: true,
    page: '#060A09',
    square: true,
    header: { backgroundColor: 'rgba(6,10,9,0.6)' },
    card: {
      backgroundColor: 'rgba(14,20,18,0.8)',
      borderWidth: 1,
      borderColor: 'rgba(79,227,224,0.32)',
      borderTopColor: 'rgba(79,227,224,0.46)',
      borderRadius: 0,
    },
    strip: {
      backgroundColor: 'rgba(14,20,18,0.9)',
      borderWidth: 1,
      borderColor: 'rgba(79,227,224,0.32)',
      borderRadius: 0,
    },
    stripActive: {
      backgroundColor: 'rgba(79,227,224,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(79,227,224,0.55)',
      borderRadius: 0,
    },
    tabIcon: 'rgb(190,196,194)',
    tabIconActive: HUD,
    barFill: { backgroundColor: 'rgba(14,20,18,0.9)' },
    barBorder: { borderWidth: 1, borderColor: 'rgba(79,227,224,0.4)', borderRadius: 0 },
    centre: {
      backgroundColor: 'rgba(79,227,224,0.14)',
      borderWidth: 1,
      borderColor: 'rgba(79,227,224,0.8)',
      borderRadius: 0,
    },
    centreIcon: HUD,
    barIcon: 'rgba(214,208,190,0.8)',
    barIconActive: HUD,
    grain: false,
    glow: HUD,
    brackets: 'rgba(79,227,224,0.8)',
    mono: true,
  },

  // Rainy neon city. The canvas carries every sign colour; the chrome locks to
  // one — sakura pink — over slate panels with a pink lit edge.
  osaka: {
    backdrop: true,
    page: '#0A0812',
    square: false,
    header: { backgroundColor: 'rgba(10,8,18,0.55)' },
    card: {
      backgroundColor: 'rgba(17,14,28,0.84)',
      borderWidth: 1,
      borderColor: 'rgba(236,233,245,0.09)',
      borderTopColor: 'rgba(255,111,181,0.30)',
      borderBottomColor: 'rgba(255,111,181,0.14)',
      borderRadius: 16,
    },
    strip: {
      backgroundColor: 'rgba(17,14,28,0.84)',
      borderWidth: 1,
      borderColor: 'rgba(236,233,245,0.10)',
      borderTopColor: 'rgba(255,111,181,0.30)',
      borderRadius: 16,
    },
    stripActive: {
      backgroundColor: 'rgba(255,111,181,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(255,111,181,0.70)',
      borderRadius: 12,
    },
    tabIcon: 'rgb(176,170,196)',
    tabIconActive: SAKURA,
    barFill: { backgroundColor: 'rgba(17,14,28,0.88)' },
    barBorder: {
      borderWidth: 1,
      borderColor: 'rgba(236,233,245,0.10)',
      borderTopColor: 'rgba(255,111,181,0.30)',
      borderRadius: 16,
    },
    centre: {
      backgroundColor: 'rgba(255,111,181,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(255,111,181,0.75)',
      borderRadius: 14,
    },
    centreIcon: 'rgb(255,190,222)',
    barIcon: 'rgba(236,233,245,0.72)',
    barIconActive: SAKURA,
    grain: false,
    glow: SAKURA,
    brackets: null,
    mono: false,
  },

  // Carved timber: bark planks with a lit top edge, the active tab sunk in.
  jungle: {
    backdrop: true,
    page: '#16110C',
    square: false,
    header: {
      backgroundColor: 'rgba(38,28,19,0.94)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.6)',
    },
    card: {
      backgroundColor: 'rgba(38,28,19,0.86)',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.55)',
      borderTopColor: 'rgba(255,246,226,0.16)',
      borderRadius: 11,
    },
    strip: {
      backgroundColor: 'rgba(38,28,19,0.86)',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.6)',
      borderTopColor: 'rgba(255,246,226,0.20)',
      borderRadius: 14,
    },
    stripActive: {
      backgroundColor: 'rgba(22,17,12,0.75)',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.7)',
      borderBottomColor: 'rgba(255,246,226,0.12)',
      borderRadius: 10,
    },
    tabIcon: 'rgb(198,182,158)',
    tabIconActive: 'rgb(246,240,227)',
    barFill: { backgroundColor: 'rgba(38,28,19,0.92)' },
    barBorder: {
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.5)',
      borderTopColor: 'rgba(255,246,226,0.18)',
      borderRadius: 16,
    },
    centre: {
      backgroundColor: 'rgba(22,17,12,0.7)',
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.6)',
      borderBottomColor: 'rgba(255,246,226,0.12)',
      borderRadius: 10,
    },
    centreIcon: 'rgb(246,240,227)',
    barIcon: 'rgba(222,210,188,0.75)',
    barIconActive: 'rgb(246,240,227)',
    grain: true,
    glow: null,
    brackets: null,
    mono: false,
  },
};

/** The active theme's skin, or null for `system` and `minimal`. */
export function getThemeSkin(theme: AppThemeName): ThemeSkin | null {
  return SKINS[theme] ?? null;
}

/** Jungle's wood fibre, tiled over its planks. */
export const GRAIN = require('../assets/theme-backdrop/grain.png');
