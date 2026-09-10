import type { ThemeColors } from './colors';

/** Build toast styles from the active palette instead of freezing system colors at import time. */
export function createToastTheme(colors: ThemeColors) {
  return {
    containerStyle: {
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    textStyle: {
      color: colors.foreground,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '500' as const,
    },
    success: {
      backgroundColor: colors.accent,
      color: colors.accentForeground,
    },
    error: {
      backgroundColor: colors.destructive,
      color: colors.destructiveForeground,
    },
    info: {
      backgroundColor: colors.card,
      color: colors.cardForeground,
    },
    warning: {
      backgroundColor: colors.muted,
      color: colors.foreground,
    },
  };
}
