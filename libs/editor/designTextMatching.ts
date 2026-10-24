let wordCharacter: RegExp;
try { wordCharacter = new RegExp("[\\p{L}\\p{M}\\p{N}_]", "u"); } catch { wordCharacter = /[A-Za-z0-9_]/; }
let cachedKey = "", cachedPattern: RegExp | null = null;
function literalPattern(query: string, matchCase: boolean): RegExp | null {
  if (!query) return null;
  const key = `${matchCase}:${query}`;
  if (key !== cachedKey || !cachedPattern) { cachedKey = key; cachedPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), matchCase ? "gu" : "giu"); }
  cachedPattern.lastIndex = 0; return cachedPattern;
}
function wholeWordAt(text: string, index: number, length: number): boolean {
  const previous = index > 0 ? text.slice(index >= 2 && /[\uDC00-\uDFFF]/.test(text[index - 1]) ? index - 2 : index - 1, index) : "";
  const following = index + length < text.length ? String.fromCodePoint(text.codePointAt(index + length)!) : "";
  return (!previous || !wordCharacter.test(previous)) && (!following || !wordCharacter.test(following));
}
export function findLiteralTextIndex(text: string, query: string, matchCase = false, wholeWords = false): number {
  const pattern = literalPattern(query, matchCase); if (!pattern) return -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) if (!wholeWords || wholeWordAt(text, match.index, match[0].length)) return match.index;
  return -1;
}
export function replaceLiteralText(text: string, query: string, replacement: string, matchCase = false, wholeWords = false): string {
  const pattern = literalPattern(query, matchCase); if (!pattern) return text;
  return text.replace(pattern, (match: string, offset: number) => !wholeWords || wholeWordAt(text, offset, match.length) ? replacement : match);
}
export function designTextSnippet(text: string, query: string, matchCase = false, wholeWords = false) {
  const index = findLiteralTextIndex(text, query, matchCase, wholeWords);
  if (index < 0) return { before: text.slice(0, 100), match: "", after: "" };
  const start = Math.max(0, index - 45), end = Math.min(text.length, index + query.length + 45);
  return { before: (start ? "…" : "") + text.slice(start, index), match: text.slice(index, index + query.length), after: text.slice(index + query.length, end) + (end < text.length ? "…" : "") };
}
export function literalTextReplacementPlan(text: string, query: string, replacement: string, matchCase = false, wholeWords = false, previewLimit = 180) {
  const pattern = literalPattern(query, matchCase), limit = Math.max(20, Math.min(500, Math.round(previewLimit)));
  let count = 0, matchedLength = 0, firstIndex = -1, firstLength = 0, cursor = 0, preview = "";
  const append = (value: string) => { if (preview.length < limit) preview += value.slice(0, limit - preview.length); };
  if (pattern) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      if (wholeWords && !wholeWordAt(text, match.index, match[0].length)) continue;
      if (firstIndex < 0) { firstIndex = match.index; firstLength = match[0].length; }
      count++; matchedLength += match[0].length;
      append(text.slice(cursor, match.index)); append(replacement); cursor = match.index + match[0].length;
    }
  }
  append(text.slice(cursor));
  const outputLength = text.length - matchedLength + count * replacement.length;
  return { count, firstIndex, firstLength, outputLength, preview: preview + (outputLength > limit ? "…" : "") };
}
