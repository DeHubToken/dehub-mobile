/**
 * Emoji tokens in plain text.
 *
 * Unicode emoji need nothing — they are characters and render as themselves.
 * What needs finding is the two ways other apps write an emoji that is not a
 * character:
 *
 *   <:name:123>  <a:name:123>   Discord's wire format (a = animated). Pasting a
 *                               message out of Discord, or a bot bridging one,
 *                               leaves these in the text. The id alone locates
 *                               the image on Discord's CDN, so they render with
 *                               no lookup at all.
 *   :name:                      Slack, GitHub, Mastodon, Misskey, Pleroma,
 *                               Discord's own input box. Either a standard emoji
 *                               (":fire:") or a custom one registered on Riftn.
 *
 * A `:name:` that resolves to nothing stays as the literal text, so a time like
 * "12:30:45" or someone typing ":this:" is never swallowed.
 *
 * Typed faces (<3 :) :D ;) :( :P </3 XD ...) become the Unicode emoji inside
 * plain-text runs. They only count when they stand alone (space or start
 * before, space/punctuation/end after), so "a<3b", "16:9", "C:/x" and links
 * stay as typed, and nothing inside `backticks` is touched.
 *
 * Kept free of React so dehub-mobile can carry the same file.
 */

export type EmojiToken =
  | { kind: 'text'; text: string }
  | { kind: 'discord'; name: string; id: string; animated: boolean; raw: string }
  | { kind: 'shortcode'; code: string; raw: string };

/** Letters, digits, _ + -; 2–64 long; at least one letter so ":30:" is never a code. */
export const SHORTCODE_BODY = '[a-zA-Z0-9_+-]*[a-zA-Z][a-zA-Z0-9_+-]*';
const SHORTCODE_RE = new RegExp(`^${SHORTCODE_BODY}$`);

export function isValidShortcode(code: string): boolean {
  return code.length >= 2 && code.length <= 64 && SHORTCODE_RE.test(code);
}

/** The only standard shortcodes with no letter in them (Slack, GitHub and Discord all use these). */
const LETTERLESS = ['+1', '-1', '100', '1234'];

const TOKEN_RE = new RegExp(
  `<(a?):([a-zA-Z0-9_~-]{1,64}):(\\d{5,25})>|:(${SHORTCODE_BODY}|\\+1|-1|100|1234):`,
  'g',
);

/** Typed faces, checked in order (longest / most specific first). */
const EMOTICONS: Array<[RegExp, string]> = [
  [/^<\/3$/, '\u{1F494}'],
  [/^<3+$/, '\u2764\uFE0F'],
  [/^>:-?\($/, '\u{1F620}'],
  [/^:'-?\($/, '\u{1F622}'],
  [/^:-?\)+$/, '\u{1F642}'],
  [/^:-?\(+$/, '\u{1F641}'],
  [/^:-?D+$/, '\u{1F603}'],
  [/^;-?\)+$/, '\u{1F609}'],
  [/^:-?[pP]$/, '\u{1F61B}'],
  [/^;-?[pP]$/, '\u{1F61C}'],
  [/^:-?[oO]$/, '\u{1F62E}'],
  [/^:-?\*$/, '\u{1F618}'],
  [/^[xX]D+$/, '\u{1F606}'],
  [/^:-?\/$/, '\u{1F615}'],
  [/^:-?\|$/, '\u{1F610}'],
  [/^\^_?\^$/, '\u{1F60A}'],
];

const EMOTICON_RE =
  /(^|[\s(["'])(<\/3|<3+|>:-?\(|:'-?\(|:-?\)+|:-?\(+|:-?D+|;-?\)+|:-?[pP]|;-?[pP]|:-?[oO]|:-?\*|[xX]D+|:-?\/|:-?\||\^_?\^)(?=$|[\s.,!?)\]"'\u2026])/g;

const EMOTICON_HINT = /[:;<^]|[xX]D/;

function emoticonFor(face: string): string | null {
  for (const [re, emoji] of EMOTICONS) if (re.test(face)) return emoji;
  return null;
}

/**
 * "<3" -> "❤️" etc. in plain text; `code spans` are left alone. `glued` means
 * the text sits straight after a link or mention, so a face at its very start
 * belongs to that link ("riftn.com/:)") and is kept as typed.
 */
export function replaceEmoticons(text: string, glued = false): string {
  if (!EMOTICON_HINT.test(text)) return text;
  return text
    .split(/(`[^`\n]*`)/)
    .map((chunk, ci) =>
      chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 1
        ? chunk
        : chunk.replace(EMOTICON_RE, (m, lead: string, face: string, offset: number) => {
            if (glued && ci === 0 && offset === 0 && lead === '') return m;
            const emoji = emoticonFor(face);
            return emoji ? lead + emoji : m;
          }),
    )
    .join('');
}

/** Cheap pre-check so text with nothing emoji-like skips the regex walk. */
export function mayContainEmojiTokens(text: string): boolean {
  return text.indexOf(':') !== -1 || EMOTICON_HINT.test(text);
}

export function tokenizeEmoji(text: string, opts: { glued?: boolean } = {}): EmojiToken[] {
  if (!mayContainEmojiTokens(text)) return [{ kind: 'text', text }];
  const out = tokenizeCodes(text);
  out.forEach((t, i) => {
    if (t.kind === 'text') t.text = replaceEmoticons(t.text, i === 0 && !!opts.glued);
  });
  return out;
}

function tokenizeCodes(text: string): EmojiToken[] {
  if (text.indexOf(':') === -1) return [{ kind: 'text', text }];
  const out: EmojiToken[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m[3]) {
      if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
      out.push({ kind: 'discord', animated: m[1] === 'a', name: m[2], id: m[3], raw: m[0] });
      last = TOKEN_RE.lastIndex;
    } else if (m[4] && (isValidShortcode(m[4]) || LETTERLESS.includes(m[4]))) {
      if (m.index > last) out.push({ kind: 'text', text: text.slice(last, m.index) });
      out.push({ kind: 'shortcode', code: m[4].toLowerCase(), raw: m[0] });
      last = TOKEN_RE.lastIndex;
    } else {
      // Not a code: give the closing ':' back so it can open the next one
      // (":not valid:fire:" still finds ":fire:").
      TOKEN_RE.lastIndex = m.index + 1;
    }
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function discordEmojiUrl(id: string, animated: boolean, size = 96): string {
  return `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=${size}&quality=lossless`;
}
