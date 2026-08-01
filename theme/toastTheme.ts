import { theme } from '.';
import { StyleSheet } from 'react-native';

// Centralized styling tokens for sonner-native
export const toastTheme = {
  get containerStyle() {
    return styles.container;
  },
  get textStyle() {
    return styles.text;
  },
  success: {
    backgroundColor: theme.colors.accent,
    color: theme.colors.accentForeground,
  },
  error: {
    backgroundColor: theme.colors.destructive,
    color: theme.colors.destructiveForeground,
  },
  info: {
    backgroundColor: theme.colors.card,
    color: theme.colors.cardForeground,
  },
  warning: {
    backgroundColor: '#D97706', // amber-ish
    color: theme.colors.foreground,
  },
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(20,20,20,0.45)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  text: {
    color: theme.colors.foreground,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
  },
});
