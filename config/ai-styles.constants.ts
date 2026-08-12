/**
 * AI Style Options
 * =================
 * Mirror of dehubweb's `src/constants/ai-styles.constants.ts`. The style ids are
 * the contract with the `enhance-text` edge function — it looks each one up in
 * its own STYLE_PROMPTS table, so an id that drifts silently falls back to
 * spellcheck. Keep this list byte-identical to web's.
 */

export const AI_STYLE_OPTIONS = [
  { id: 'old-english', label: 'Old English', emoji: '🏰' },
  { id: 'cockney', label: 'Cockney', emoji: '🎩' },
  { id: 'celtic', label: 'Celtic', emoji: '☘️' },
  { id: 'scouse', label: 'Scouse', emoji: '⚽' },
  { id: 'wild-west', label: 'Wild West', emoji: '🤠' },
  { id: 'asian-uncle', label: 'Asian Uncle', emoji: '👴' },
  { id: 'russian-mafia', label: 'Russian Mafia', emoji: '🎰' },
  { id: 'pirate', label: 'Pirate', emoji: '🏴‍☠️' },
  { id: 'alien', label: 'Alien', emoji: '👽' },
  { id: 'e-girl', label: 'E-Girl', emoji: '💖' },
  { id: 'chad', label: 'Chad', emoji: '💪' },
  { id: 'hopeless-romantic', label: 'Hopeless Romantic', emoji: '💕' },
  { id: 'daddy', label: 'Daddy', emoji: '👨' },
  { id: 'mommy', label: 'Mommy', emoji: '👩' },
  { id: 'big-brother', label: 'Big Brother', emoji: '🧑' },
  { id: 'lil-bro', label: 'Lil Bro', emoji: '👦' },
  { id: 'big-sister', label: 'Big Sister', emoji: '👧' },
  { id: 'little-sister', label: 'Little Sister', emoji: '👶' },
  // Political & Ideological personalities
  { id: 'conservative', label: 'Conservative', emoji: '🐘' },
  { id: 'liberal', label: 'Liberal', emoji: '🗽' },
  { id: 'antifa', label: 'ANTIFA', emoji: '✊' },
  { id: 'capitalist', label: 'Capitalist', emoji: '💰' },
  { id: 'socialist', label: 'Socialist', emoji: '🌹' },
  { id: 'neocon', label: 'Neocon', emoji: '🦅' },
  { id: 'feminist', label: 'Feminist', emoji: '♀️' },
  { id: 'progressive', label: 'Progressive', emoji: '🌈' },
  { id: 'nationalist', label: 'Nationalist', emoji: '🏳️' },
  { id: 'communist', label: 'Communist', emoji: '🚩' },
] as const;

export type AIStyleId = (typeof AI_STYLE_OPTIONS)[number]['id'];

/** Emoji picker categories — same four groups, same order, as web's EmojiGifPicker. */
export const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '🤪', '😎', '🤩', '🥳'],
  Gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🦾', '🖐️', '✋', '👋', '🤚', '🖖', '👊'],
  Hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  Objects: ['🔥', '⭐', '✨', '💫', '🌟', '💥', '💯', '🎉', '🎊', '🎁', '🏆', '🥇', '🎮', '🎯', '🎨', '🎬', '📸', '💰', '💎', '🚀'],
};
