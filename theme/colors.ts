export const colors = {
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

  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  success: '#22C55E',

  /** Mirrors tailwind's theme.neutrals scale for StyleSheet/props usage. */
  neutrals: {
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
} as const;
