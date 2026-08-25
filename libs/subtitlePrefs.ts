import { storage } from './storage';

/**
 * Subtitle preferences, kept the way the muted state is: read synchronously
 * from MMKV so the first frame of a video already knows whether captions are
 * on, rather than flashing them in a tick later.
 */

const ENABLED_KEY = 'video-subs-enabled';
const LANG_KEY = 'video-subs-lang';
const SIZE_KEY = 'video-subs-size';

export type SubtitleSize = 'sm' | 'md' | 'lg';

export const SUBTITLE_SIZES: Record<SubtitleSize, number> = { sm: 12, md: 14, lg: 18 };

/** The picker. Deliberately the same codes dehubweb offers, so a translation
 *  cached by a web viewer is a row read on mobile and not a second bill. */
export const SUBTITLE_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: 'original', name: 'Original' },
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'ru', name: 'Русский' },
  { code: 'uk', name: 'Українська' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'ar', name: 'العربية' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
  { code: 'zh', name: '中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

export function getSubtitlesEnabled(): boolean {
  try { return storage.getString(ENABLED_KEY) === 'true'; } catch { return false; }
}

export function setSubtitlesEnabled(on: boolean): void {
  try { storage.set(ENABLED_KEY, String(on)); } catch {}
}

export function getSubtitleLang(): string {
  try { return storage.getString(LANG_KEY) || 'original'; } catch { return 'original'; }
}

export function setSubtitleLang(code: string): void {
  try { storage.set(LANG_KEY, code); } catch {}
}

export function getSubtitleSize(): SubtitleSize {
  try {
    const v = storage.getString(SIZE_KEY) as SubtitleSize | undefined;
    return v && v in SUBTITLE_SIZES ? v : 'md';
  } catch {
    return 'md';
  }
}

export function setSubtitleSize(size: SubtitleSize): void {
  try { storage.set(SIZE_KEY, size); } catch {}
}

/** Break a long cue into short lines and split its duration by length, so a
 *  forty-word segment does not land on screen as a wall of text. */
export function splitIntoLines<T extends { start: number; end: number; text: string }>(
  segments: T[],
  maxChars = 42,
): T[] {
  const out: T[] = [];
  for (const seg of segments) {
    const clean = (seg.text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) continue;
    if (clean.length <= maxChars) {
      out.push({ ...seg, text: clean });
      continue;
    }
    const words = clean.split(' ');
    const chunks: string[] = [];
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
      else { chunks.push(cur); cur = w; }
    }
    if (cur) chunks.push(cur);
    // A one-word orphan reads as a mistake; fold it back.
    if (chunks.length >= 2) {
      const last = chunks[chunks.length - 1];
      if (!last.includes(' ') || last.length <= 8) {
        chunks[chunks.length - 2] += ' ' + last;
        chunks.pop();
      }
    }
    const total = Math.max(0, seg.end - seg.start);
    const chars = chunks.reduce((a, c) => a + c.length, 0) || 1;
    let cursor = seg.start;
    chunks.forEach((c, i) => {
      const end = i === chunks.length - 1 ? seg.end : cursor + (c.length / chars) * total;
      out.push({ ...seg, start: cursor, end, text: c });
      cursor = end;
    });
  }
  return out;
}
