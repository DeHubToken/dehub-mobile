/**
 * Cut pieces (a carded link, a contract address) out of text for display,
 * tidying only the gaps they leave behind. The writer's own spacing, line
 * breaks and blank lines are kept exactly as typed.
 *
 * Display only — never send the result back to an API.
 */
const MARK = '\u0000';

export function cutFromText(text: string, pieces: readonly string[]): string {
  let out = text;
  for (const piece of pieces) {
    if (piece) out = out.split(piece).join(MARK);
  }
  if (!out.includes(MARK)) return text;
  return out
    // A line that held nothing but cut pieces goes, line break and all.
    .replace(/^[ \t]*(?:\u0000[ \t]*)+(?:\r?\n|$)/gm, '')
    // At either end of a line the gap simply closes...
    .replace(/[ \t]*(?:\u0000[ \t]*)+(?=\r?\n|$)/g, '')
    .replace(/(^|\n)[ \t]*(?:\u0000[ \t]*)+/g, '$1')
    // ...and mid-sentence it closes to one space.
    .replace(/[ \t]*(?:\u0000[ \t]*)+/g, ' ')
    .replace(/\s+$/, '');
}
