import { translateCopy as _translateCopy } from '../i18n/copy';
/**
 * AI Style Options
 * =================
 * Mirror of dehubweb's `src/constants/ai-styles.constants.ts`. The style ids are
 * the contract with the `enhance-text` edge function — it looks each one up in
 * its own STYLE_PROMPTS table, so an id that drifts silently falls back to
 * spellcheck. Keep this list byte-identical to web's.
 */

export const AI_STYLE_OPTIONS = [
  { id: 'old-english', get label() { return _translateCopy("copy.a77a65e67991", { defaultValue: "Old English" }); }, emoji: '🏰' },
  { id: 'cockney', get label() { return _translateCopy("copy.1855cc1a13c2", { defaultValue: "Cockney" }); }, emoji: '🎩' },
  { id: 'celtic', get label() { return _translateCopy("copy.f65a88ae0a98", { defaultValue: "Celtic" }); }, emoji: '☘️' },
  { id: 'scouse', get label() { return _translateCopy("copy.46c403a10f6b", { defaultValue: "Scouse" }); }, emoji: '⚽' },
  { id: 'wild-west', get label() { return _translateCopy("copy.530cac08f6b4", { defaultValue: "Wild West" }); }, emoji: '🤠' },
  { id: 'asian-uncle', get label() { return _translateCopy("copy.637fc3577a47", { defaultValue: "Asian Uncle" }); }, emoji: '👴' },
  { id: 'russian-mafia', get label() { return _translateCopy("copy.b5b2b23163a8", { defaultValue: "Russian Mafia" }); }, emoji: '🎰' },
  { id: 'pirate', get label() { return _translateCopy("copy.2aecfe15c341", { defaultValue: "Pirate" }); }, emoji: '🏴‍☠️' },
  { id: 'alien', get label() { return _translateCopy("copy.72e4646b0bfe", { defaultValue: "Alien" }); }, emoji: '👽' },
  { id: 'e-girl', get label() { return _translateCopy("copy.d577cb7ddd24", { defaultValue: "E-Girl" }); }, emoji: '💖' },
  { id: 'chad', get label() { return _translateCopy("copy.4256e512fcfb", { defaultValue: "Chad" }); }, emoji: '💪' },
  { id: 'hopeless-romantic', get label() { return _translateCopy("copy.8917519e3498", { defaultValue: "Hopeless Romantic" }); }, emoji: '💕' },
  { id: 'daddy', get label() { return _translateCopy("copy.e585737a1d8e", { defaultValue: "Daddy" }); }, emoji: '👨' },
  { id: 'mommy', get label() { return _translateCopy("copy.f0ecd978e585", { defaultValue: "Mommy" }); }, emoji: '👩' },
  { id: 'big-brother', get label() { return _translateCopy("copy.2adfe76a55e2", { defaultValue: "Big Brother" }); }, emoji: '🧑' },
  { id: 'lil-bro', get label() { return _translateCopy("copy.f461766bfa0f", { defaultValue: "Lil Bro" }); }, emoji: '👦' },
  { id: 'big-sister', get label() { return _translateCopy("copy.e1cc447756e6", { defaultValue: "Big Sister" }); }, emoji: '👧' },
  { id: 'little-sister', get label() { return _translateCopy("copy.d0411788be5e", { defaultValue: "Little Sister" }); }, emoji: '👶' },
  // Political & Ideological personalities
  { id: 'conservative', get label() { return _translateCopy("copy.75e1783e4e51", { defaultValue: "Conservative" }); }, emoji: '🐘' },
  { id: 'liberal', get label() { return _translateCopy("copy.16840520f59c", { defaultValue: "Liberal" }); }, emoji: '🗽' },
  { id: 'antifa', get label() { return _translateCopy("copy.12a5fb358f94", { defaultValue: "ANTIFA" }); }, emoji: '✊' },
  { id: 'capitalist', get label() { return _translateCopy("copy.2047fba23d86", { defaultValue: "Capitalist" }); }, emoji: '💰' },
  { id: 'socialist', get label() { return _translateCopy("copy.aa86f8f06a80", { defaultValue: "Socialist" }); }, emoji: '🌹' },
  { id: 'neocon', get label() { return _translateCopy("copy.9e480ba758b3", { defaultValue: "Neocon" }); }, emoji: '🦅' },
  { id: 'feminist', get label() { return _translateCopy("copy.bae8448539c2", { defaultValue: "Feminist" }); }, emoji: '♀️' },
  { id: 'progressive', get label() { return _translateCopy("copy.c21bea0c6d59", { defaultValue: "Progressive" }); }, emoji: '🌈' },
  { id: 'nationalist', get label() { return _translateCopy("copy.71470134ff19", { defaultValue: "Nationalist" }); }, emoji: '🏳️' },
  { id: 'communist', get label() { return _translateCopy("copy.cca21847e6f7", { defaultValue: "Communist" }); }, emoji: '🚩' },
] as const;

/**
 * The assistant's personality picker: the same list with "Normal" at the front,
 * exactly as web's `AI_ASSISTANT_STYLE_OPTIONS`. `normal` is a real id meaning
 * "no persona" — sending no style at all is not the same thing, because
 * `general-ai-chat` only skips the persona block when it recognises the id.
 */
export const AI_ASSISTANT_STYLE_OPTIONS = [
  { id: 'normal', get label() { return _translateCopy("copy.a7248eeb45eb", { defaultValue: "Normal" }); }, emoji: '🤖' },
  ...AI_STYLE_OPTIONS,
] as const;

export type AIStyleId = (typeof AI_STYLE_OPTIONS)[number]['id'];
export type AIAssistantStyleId = (typeof AI_ASSISTANT_STYLE_OPTIONS)[number]['id'];

/** Emoji picker categories — same four groups, same order, as web's EmojiGifPicker. */
export const EMOJI_CATEGORIES: Record<string, string[]> = {
  Smileys: ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '🤪', '😎', '🤩', '🥳'],
  Gestures: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '👐', '🤲', '🙏', '💪', '🦾', '🖐️', '✋', '👋', '🤚', '🖖', '👊'],
  Hearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  Objects: ['🔥', '⭐', '✨', '💫', '🌟', '💥', '💯', '🎉', '🎊', '🎁', '🏆', '🥇', '🎮', '🎯', '🎨', '🎬', '📸', '💰', '💎', '🚀'],
};
