/**
 * How a DM video plays, as the sender set it in the video sheet: the kept
 * range, the cover frame, a mirror flip, a quarter-turn rotation, and whether
 * it stays covered until the other person taps it.
 *
 * Nothing is re-encoded. The file goes out as picked and every player applies
 * these on the way out, so they travel inside the sealed descriptor for an
 * encrypted chat and as `mediaOptions` on the message otherwise.
 * Same contract as dehubweb `src/lib/dm-video-options.ts`.
 */
import { storage } from './storage';

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface DmVideoOptions {
  trimStart?: number;
  trimEnd?: number;
  coverAt?: number;
  mirror?: boolean;
  rotate?: QuarterTurn;
  hidden?: 'reveal';
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : undefined;

/** Drops defaults and junk, so an untouched video sends no options at all. */
export function cleanVideoOptions(o: DmVideoOptions | null | undefined, duration?: number): DmVideoOptions | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const out: DmVideoOptions = {};
  const start = num(o.trimStart);
  let end = num(o.trimEnd);
  if (end !== undefined && duration && end >= duration - 0.05) end = undefined;
  if (start && start > 0.05) out.trimStart = start;
  if (end !== undefined && end > (out.trimStart ?? 0)) out.trimEnd = end;
  const cover = num(o.coverAt);
  if (cover !== undefined) out.coverAt = cover;
  if (o.mirror === true) out.mirror = true;
  if (o.rotate === 90 || o.rotate === 180 || o.rotate === 270) out.rotate = o.rotate;
  if (o.hidden === 'reveal') out.hidden = 'reveal';
  return Object.keys(out).length ? out : undefined;
}

export const nextQuarterTurn = (r: QuarterTurn | undefined): QuarterTurn => (((r ?? 0) + 90) % 360) as QuarterTurn;

/** True when the picture is turned on its side, so width and height swap. */
export const isSideways = (o?: DmVideoOptions | null) => o?.rotate === 90 || o?.rotate === 270;

/** React Native transform for the picture. Rotation first, then the flip. */
export function videoTransform(o?: DmVideoOptions | null): ({ rotate: string } | { scaleX: number })[] {
  const out: ({ rotate: string } | { scaleX: number })[] = [];
  if (o?.rotate) out.push({ rotate: `${o.rotate}deg` });
  if (o?.mirror) out.push({ scaleX: -1 });
  return out;
}

/** Length the other person will actually watch. */
export function keptDuration(o: DmVideoOptions | null | undefined, duration?: number): number | undefined {
  if (!duration) return undefined;
  const start = o?.trimStart ?? 0;
  const end = o?.trimEnd ?? duration;
  return Math.max(0, end - start);
}

/** First frame shown before play: the chosen cover, else the trim start. */
export function posterTime(o?: DmVideoOptions | null): number {
  return o?.coverAt ?? o?.trimStart ?? 0.1;
}

export function formatClock(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Box for a video of w×h shown at most maxW×maxH, after rotation. Returns
 * the outer box and the size the <video> element must have before it is
 * turned, so a sideways video still fills the box exactly.
 */
export function fitVideoBox(w: number | undefined, h: number | undefined, o: DmVideoOptions | null | undefined, maxW: number, maxH: number) {
  const vw = w && h ? w : 16;
  const vh = w && h ? h : 9;
  const side = isSideways(o);
  const shownW = side ? vh : vw;
  const shownH = side ? vw : vh;
  const scale = Math.min(maxW / shownW, maxH / shownH);
  const boxW = Math.round(shownW * scale);
  const boxH = Math.round(shownH * scale);
  return { boxW, boxH, innerW: side ? boxH : boxW, innerH: side ? boxW : boxH };
}

const REVEALED_KEY = 'dm.revealed';

/** Ids of hidden videos this phone has already uncovered. */
export function hasRevealed(messageId: string): boolean {
  try {
    const raw = storage.getString(REVEALED_KEY);
    return !!raw && (JSON.parse(raw) as string[]).includes(messageId);
  } catch {
    return false;
  }
}

export function markRevealed(messageId: string): void {
  try {
    const raw = storage.getString(REVEALED_KEY);
    const ids = raw ? (JSON.parse(raw) as string[]) : [];
    if (ids.includes(messageId)) return;
    ids.push(messageId);
    storage.set(REVEALED_KEY, JSON.stringify(ids.slice(-500)));
  } catch {
    /* it just asks again next time */
  }
}
