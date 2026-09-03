/**
 * What the user is actually asking the assistant for.
 * ===================================================
 * The assistant routes a message one of four ways: an image job, a video job,
 * an AI tool, or a chat answer. The first three cost live DHB, so this is the
 * code that decides whether someone is about to be charged — and it has to be
 * right, because on the chat surface the transfer is signed inline with no
 * modal in between.
 *
 * Two rules, both learnt the expensive way.
 *
 * **Match whole words.** The phrase lists were tested with `includes()`, which
 * matches inside other words. `'draw'` is inside "withdrawal", so
 * "I already withdrawal my token from staking but still not received" was an
 * image request. So was anything containing "already" (`'ad'`), "input"
 * (`'put'`), "promotion" (`'motion'`) or "designated" (`'design'`). A real
 * user asking support why their unstaked DHB had not arrived was quoted 24 DHB
 * four times and paid it once, and the answer they wanted was never given.
 *
 * **A support question is never a generation.** Half the image list is ordinary
 * English — 'show me', 'i want', 'give me', 'what does', 'create a' — which is
 * how people phrase account problems too ("show me my balance", "i want my
 * withdrawal"). Phrases that only ever mean "make me a picture" are explicit
 * and win outright; the loose ones stand down when the message is about money,
 * an account or something broken.
 */

/** Categories the AI-tool paywall understands. Mirrors web's ai-tools.constants. */
export type AiToolCategory = 'music' | 'tts' | 'background-removal' | 'upscale' | 'speech-to-text';

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Does `text` contain `phrase` as a whole word or phrase?
 *
 * Deliberately built without lookbehind: Hermes (React Native) has only
 * shipped it recently, and this file's twin runs there. `[^a-z0-9]` on both
 * sides is enough — apostrophes, hyphens and punctuation all count as
 * boundaries, which is what we want for "don't", "sign-in" and "image?".
 */
export function matchesPhrase(text: string, phrase: string): boolean {
  const boundary = '[^a-z0-9]';
  return new RegExp(`(?:^|${boundary})${escapeForRegex(phrase)}(?:${boundary}|$)`, 'i').test(text);
}

function matchesAny(text: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => matchesPhrase(text, phrase));
}

/**
 * Vocabulary that means "I have a problem with my account or my money".
 *
 * Nothing here is a generation, whatever else the sentence contains. The one
 * exception is an explicit phrase below — "draw me a picture of my wallet" is
 * still a picture.
 */
const SUPPORT_KEYWORDS = [
  'withdraw', 'withdraws', 'withdrew', 'withdrawal', 'withdrawals', 'withdrawn',
  'stake', 'staked', 'staking', 'unstake', 'unstaked', 'unstaking',
  'deposit', 'deposited', 'refund', 'refunded', 'reimburse',
  'balance', 'transaction', 'transactions', 'tx', 'txn', 'hash',
  'wallet', 'wallets', 'claim', 'claimed', 'claiming', 'reward', 'rewards',
  'payout', 'payouts', 'transfer', 'transferred', 'transferring',
  'received', 'receive', 'receiving', 'pending', 'stuck', 'missing', 'lost',
  'login', 'log in', 'logged in', 'sign in', 'signed in', 'signin', 'log out',
  'password', 'passkey', 'recovery', 'verification', 'verify', 'kyc', '2fa',
  'airdrop', 'subscription', 'subscribed', 'billing', 'invoice', 'charged',
  'payment', 'payments', 'paid', 'fee', 'fees', 'gas',
  'support', 'ticket', 'complaint', 'scam', 'hacked', 'stolen',
  'locked', 'frozen', 'suspended', 'banned', 'blocked',
  'not working', 'not work', "doesn't work", "didn't work", 'does not work',
  'error', 'failed', 'failing', 'bug', 'broken', 'crash', 'crashed',
];

/**
 * True when the message reads as a support or account question.
 *
 * Exported so a surface can refuse to open a paywall on one even if it
 * classifies the request some other way.
 */
export function isSupportQuestion(message: string): boolean {
  return matchesAny(message, SUPPORT_KEYWORDS);
}

/** Phrases that can only mean "generate a picture". These beat the guard. */
const EXPLICIT_IMAGE_PHRASES = [
  'generate image', 'generate an image', 'generate a picture', 'generate artwork',
  'create image', 'create an image', 'create a picture', 'create artwork',
  'make image', 'make an image', 'make a picture', 'make art', 'make artwork',
  'draw me', 'draw a', 'draw an', 'draw the',
  'photo of', 'picture of', 'image of', 'illustration of', 'portrait of',
  'edit this image', 'change this image', 'add to this image', 'remove from this image',
  'make a poster', 'create a poster', 'generate a poster',
  'make a banner', 'create a banner', 'generate a banner',
];

/**
 * Phrases that usually mean a picture but are ordinary English otherwise.
 *
 * Every one of these stands down on a support question. `'draw'` and
 * `'design'` are here rather than above because as bare verbs they are also
 * nouns people use about the product ("the design of the app").
 */
const LOOSE_IMAGE_PHRASES = [
  'draw', 'design', 'modify this', 'remove from',
  'generate a', 'create a', 'make me', 'visualize', 'depict', 'render',
];

/**
 * The looser tail the full assistant page adds on top.
 *
 * The chat bubble deliberately does NOT use these: it signs the transfer
 * inline with no confirmation step, so "show me" costing 24 DHB there would be
 * money taken without a click. The assistant page opens a paywall first.
 */
const CONVERSATIONAL_IMAGE_PHRASES = [
  'show me', 'show a', 'give me', 'i want', 'can you show', 'what does', 'look like',
];

/** Phrases that can only mean "generate a video". */
const EXPLICIT_VIDEO_PHRASES = [
  'generate video', 'generate a video', 'create video', 'create a video',
  'make video', 'make a video', 'animate this', 'animate it',
  'video of', 'clip of', 'footage of',
  'into a video', 'into video', 'as a video', 'turn this into',
];

/** Video phrasing that is also ordinary English. */
const LOOSE_VIDEO_PHRASES = [
  'animate', 'animation', 'motion', 'moving',
  'bring to life', 'make it move', 'make this move', 'turn into',
];

const EXPLICIT_MUSIC_PHRASES = [
  'generate music', 'create music', 'make music', 'write music', 'compose music',
  'create a song', 'make a song', 'generate a song', 'write a song',
  'make me a beat', 'create a beat', 'generate a beat', 'create a track',
  'music for',
];

const LOOSE_MUSIC_PHRASES = ['compose', 'song', 'beat', 'track', 'melody', 'instrumental'];

const EXPLICIT_TTS_PHRASES = [
  'text to speech', 'text-to-speech', 'read this aloud', 'read out loud',
  'say this', 'speak this', 'convert to speech', 'voice over', 'voiceover',
  'generate speech', 'create speech', 'make speech', 'voice this', 'read this text',
];

const LOOSE_TTS_PHRASES = ['tts', 'narrate', 'narration', 'dialogue'];

const EXPLICIT_STT_PHRASES = [
  'transcribe', 'transcribe this', 'transcribe audio', 'transcription',
  'speech to text', 'speech-to-text', 'audio to text', 'convert audio', 'convert speech',
];

const LOOSE_STT_PHRASES = ['stt', 'what does this say', 'what is being said'];

const BG_REMOVAL_PHRASES = [
  'remove background', 'remove the background', 'remove bg', 'background removal',
  'cut out', 'cutout', 'transparent background', 'make transparent',
  'isolate subject', 'extract subject', 'no background', 'delete background',
  'erase background',
];

const UPSCALE_PHRASES = [
  'upscale', 'upscale this', 'enhance image', 'increase resolution',
  'make higher resolution', 'make hd', 'make 4k', 'sharpen image',
  'improve quality', 'super resolution', 'enlarge image', 'make bigger',
  'enhance this', 'enhance quality',
];

/** Phrases that mean the official logo should be composited into the image. */
const LOGO_PHRASES = [
  'dehub logo', 'the dehub logo', 'ftv logo', 'the ftv logo',
  'your logo', 'the logo', 'official logo', 'dehub brand',
  'ftv brand', 'brand logo', 'company logo',
];

/** Artefacts the brand pipeline knows how to make, once DeHub is named. */
const DEHUB_BRAND_ARTEFACTS = [
  'poster', 'posters', 'banner', 'banners', 'thumbnail', 'thumbnails',
  'card', 'cards', 'announcement', 'announcements', 'flyer', 'flyers',
  'artwork', 'cover', 'graphic', 'graphics', 'advert', 'advertisement',
  'image', 'wallpaper', 'meme', 'promo', 'campaign',
];

/**
 * Decide a category the way every surface should: explicit wins, loose yields
 * to a support question.
 */
function classify(message: string, explicit: readonly string[], loose: readonly string[]): boolean {
  if (matchesAny(message, explicit)) return true;
  if (isSupportQuestion(message)) return false;
  return matchesAny(message, loose);
}

export interface ImageIntentOptions {
  /**
   * Include the conversational tail ('show me', 'i want', 'what does').
   *
   * Only for surfaces that confirm the price before signing.
   */
  conversational?: boolean;
}

export function requiresImageGeneration(
  message: string,
  hasAttachedImage: boolean,
  options: ImageIntentOptions = {},
): boolean {
  // A video request is not an image request, and the video words win — half
  // the video phrases ("animate this picture") also match an image phrase.
  // Checked before the attachment, or "animate this" on an attached photo
  // would be billed as an edit.
  if (requiresVideoGeneration(message)) return false;
  // An attachment plus an instruction is an edit, whatever the words are.
  if (hasAttachedImage) return true;
  const loose = options.conversational
    ? [...LOOSE_IMAGE_PHRASES, ...CONVERSATIONAL_IMAGE_PHRASES]
    : LOOSE_IMAGE_PHRASES;
  return classify(message, EXPLICIT_IMAGE_PHRASES, loose);
}

export function requiresVideoGeneration(message: string): boolean {
  return classify(message, EXPLICIT_VIDEO_PHRASES, LOOSE_VIDEO_PHRASES);
}

export function requiresLogoAsset(message: string): boolean {
  return matchesAny(message, LOGO_PHRASES);
}

export function isDeHubBrandedImageRequest(message: string): boolean {
  const mentionsDeHub = /\bde\s*hub\b/i.test(message) || /\bdhb\b/i.test(message);
  if (!mentionsDeHub) return false;
  if (isSupportQuestion(message)) return false;
  return matchesAny(message, DEHUB_BRAND_ARTEFACTS);
}

export function detectAiToolRequest(message: string, hasImage: boolean): AiToolCategory | null {
  if (classify(message, EXPLICIT_MUSIC_PHRASES, LOOSE_MUSIC_PHRASES)) return 'music';
  if (classify(message, EXPLICIT_TTS_PHRASES, LOOSE_TTS_PHRASES)) return 'tts';
  if (classify(message, EXPLICIT_STT_PHRASES, LOOSE_STT_PHRASES)) return 'speech-to-text';
  if (hasImage && matchesAny(message, BG_REMOVAL_PHRASES)) return 'background-removal';
  if (hasImage && matchesAny(message, UPSCALE_PHRASES)) return 'upscale';
  return null;
}

/**
 * False for a bare "show me the logo" — that just displays the bundled asset
 * rather than paying a model to redraw it.
 */
export function isCreativeLogoRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const simpleShowPatterns = [
    /^show\s*(me\s*)?(the\s*)?(dehub|ftv|your|official|brand|company)?\s*logo\.?$/,
    /^(dehub|ftv)\s*logo\.?$/,
    /^(the\s*)?(dehub|ftv|official)\s*logo\.?$/,
    /^display\s*(the\s*)?(dehub|ftv)?\s*logo\.?$/,
  ];
  if (simpleShowPatterns.some((pattern) => pattern.test(lower))) return false;
  return true;
}
