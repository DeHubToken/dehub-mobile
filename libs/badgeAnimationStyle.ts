/** Same policy as web; a future Light theme inherits the same material. */
export function badgeAnimationStyle(theme: string): 'metallic' | 'sticker' {
  return theme === 'system' || theme === 'light' || theme === 'minimal' ? 'metallic' : 'sticker';
}
