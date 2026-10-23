/**
 * Lyrics for audio posts, from the transcript every audio post already gets
 * (the `transcribe` function, kind 'audio'). Transcript segments are whole
 * sentences and can run ten seconds or more, which is far too much text to sit
 * over a song at once, so each one is cut into short lines and its time shared
 * out between them by length.
 *
 * Kept word for word with dehubweb src/lib/lyrics-lines.ts.
 */
export interface LyricSegment { start: number; end: number; text: string }
export interface LyricLine { start: number; end: number; text: string }

/** About what fits on one line of a phone-width card. */
const MAX_LINE_CHARS = 38;
/** A line stays up this long past its end before the card clears. */
const HOLD_AFTER_END = 1.5;

export function lyricLines(segments: readonly LyricSegment[] | null | undefined): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const seg of segments ?? []) {
    const words = String(seg?.text ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const start = Number(seg.start) || 0;
    const end = Math.max(start, Number(seg.end) || start);
    const chunks: string[] = [];
    let current = '';
    for (const word of words) {
      if (current && current.length + 1 + word.length > MAX_LINE_CHARS) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) chunks.push(current);
    const total = chunks.reduce((sum, c) => sum + c.length, 0) || 1;
    let at = start;
    for (const chunk of chunks) {
      const span = (end - start) * (chunk.length / total);
      lines.push({ start: at, end: at + span, text: chunk });
      at += span;
    }
  }
  return lines.sort((a, b) => a.start - b.start);
}

/** The line being sung at `time` and the one after it. Nothing during a long
 *  instrumental gap, so the card is not left holding a stale line. */
export function lyricAt(lines: readonly LyricLine[], time: number): { current: LyricLine | null; next: LyricLine | null } {
  let index = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= time + 0.15) index = i;
    else break;
  }
  if (index < 0) return { current: null, next: lines[0] && lines[0].start - time < 3 ? lines[0] : null };
  const line = lines[index];
  const next = lines[index + 1] ?? null;
  if (time > line.end + HOLD_AFTER_END) return { current: null, next: next && next.start - time < 3 ? next : null };
  return { current: line, next };
}
