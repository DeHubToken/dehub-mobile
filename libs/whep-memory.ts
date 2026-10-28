/**
 * Streams whose WebRTC answered but never sent a picture.
 *
 * Same rule as the web (src/lib/live/whep-memory.ts): once a stream has been
 * silent over WebRTC on this device, open it on HLS straight away for half an
 * hour instead of waiting out the WebRTC start timeout every time.
 */
import { storage } from './storage';

const KEY = 'dehub.live.whepSilent';
const FORGET_AFTER_MS = 30 * 60_000;

type Silent = Record<string, number>;

function read(): Silent {
  try {
    const raw = storage.getString(KEY);
    const parsed = raw ? (JSON.parse(raw) as Silent) : {};
    const now = Date.now();
    for (const [id, at] of Object.entries(parsed)) if (now - at > FORGET_AFTER_MS) delete parsed[id];
    return parsed;
  } catch {
    return {};
  }
}

function write(next: Silent) {
  try {
    storage.set(KEY, JSON.stringify(next));
  } catch {
    /* Storage unavailable: every open just tries WebRTC again. */
  }
}

export function whepRecentlySilent(playbackId: string | null | undefined): boolean {
  return !!playbackId && playbackId in read();
}

export function rememberWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  write({ ...read(), [playbackId]: Date.now() });
}

export function forgetWhepSilent(playbackId: string | null | undefined) {
  if (!playbackId) return;
  const current = read();
  if (!(playbackId in current)) return;
  delete current[playbackId];
  write(current);
}

/** A real picture, not the 2x2 placeholder a silent track can report. */
export function isRealPicture(size: { width: number; height: number }): boolean {
  return size.width >= 16 && size.height >= 16;
}
