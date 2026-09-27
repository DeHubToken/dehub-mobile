/**
 * Emoji a Kids Mode account cannot pick.
 *
 * Kids Mode filters content on the server; this is the picker's half of it.
 * Everything else in Unicode stays available — the list is only the gestures,
 * innuendo, substances, weapons and gambling a parent would not expect to see
 * a child send. Custom emoji are hidden separately and wholesale: they are
 * images anyone can upload, and nobody reviews them.
 *
 * Matched on the base character with skin tones and variation selectors
 * stripped, so 🖕🏿 is caught along with 🖕.
 */

const BLOCKED = [
  // Rude gestures, swearing
  '🖕', '🤬',
  // Sexual innuendo
  '🍆', '🍑', '💦', '👅', '🫦', '💋', '🔞', '🩲', '👙', '🍒', '🌮', '🥵', '😈', '👄',
  // Alcohol, tobacco, drugs
  '🍺', '🍻', '🍷', '🍸', '🍹', '🍾', '🥂', '🥃', '🍶', '🚬', '💉', '💊', '🍁', '🌿', '🍄', '🫗',
  // Weapons and violence
  '🔫', '💣', '🔪', '🗡', '⚔', '🪓', '🩸', '🧨', '🏹', '🪃', '⚰', '🪦', '☠', '🥊',
  // Gambling
  '🎰', '🎲', '🃏', '🀄', '🎴', '💸',
];

const strip = (s: string) => s.replace(/[\u{1F3FB}-\u{1F3FF}️]/gu, '');

const BLOCKED_SET = new Set(BLOCKED.map(strip));

export function isKidsBlockedEmoji(emoji: string): boolean {
  return BLOCKED_SET.has(strip(emoji));
}
