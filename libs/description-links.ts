/**
 * Community description links
 * ===========================
 * Splits a community description into text and link runs so links show as an
 * inline 🔗, the way the web shows them in posts and community descriptions.
 * Only the display changes: the stored description is never rewritten.
 *
 * Link matching is the chat matcher (`chat-links.ts`), which mirrors the web.
 * On top of it:
 *  - markdown links (`[Sign up](https://…)`) read as the label then the 🔗;
 *  - a full stop, comma or closing bracket after a link goes back to the text;
 *  - an email address is not a link.
 */
import { tokenizeChatText, type ChatTextToken } from './chat-links';

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Sentence punctuation stuck to the end of a link; keeps `Foo_(bar)` whole. */
export function trimTrailingUrlPunctuation(url: string): string {
  let out = url;
  for (;;) {
    if (/[.,:;?!]$/.test(out)) { out = out.slice(0, -1); continue; }
    if (out.endsWith(')') && (out.match(/\(/g)?.length ?? 0) < (out.match(/\)/g)?.length ?? 0)) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

export function prepareDescriptionText(text: string, singleLine = false): string {
  const out = text.replace(/\[([^\]\n]+)\]\(\s*(\S+?)\s*\)/g, '$1 $2');
  return singleLine ? out.replace(/\s+/g, ' ').trim() : out;
}

export function tokenizeDescription(text?: string | null, singleLine = false): ChatTextToken[] {
  const tokens: ChatTextToken[] = [];
  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.type === 'text') last.value += value;
    else tokens.push({ type: 'text', value });
  };

  for (const token of tokenizeChatText(prepareDescriptionText(text ?? '', singleLine))) {
    if (token.type === 'text') { pushText(token.value); continue; }
    const value = trimTrailingUrlPunctuation(token.value);
    if (!value || EMAIL_REGEX.test(value)) { pushText(token.value); continue; }
    tokens.push({ type: 'link', value, url: /^https?:\/\//i.test(value) ? value : `https://${value}` });
    pushText(token.value.slice(value.length));
  }
  return tokens;
}
