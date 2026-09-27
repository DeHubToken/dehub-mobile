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
 *                               (":fire:") or a custom one registered on DeHub.
 *
 * A `:name:` that resolves to nothing stays as the literal text, so a time like
 * "12:30:45" or someone typing ":this:" is never swallowed.
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

/** Cheap pre-check so text with no ':' at all skips the regex walk. */
export function mayContainEmojiTokens(text: string): boolean {
  return text.indexOf(':') !== -1;
}

export function tokenizeEmoji(text: string): EmojiToken[] {
  if (!mayContainEmojiTokens(text)) return [{ kind: 'text', text }];
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
