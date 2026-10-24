/**
 * Generated stage covers
 * ======================
 * A stage without an uploaded cover gets a poster drawn in code from its own
 * details: title, start time, host and status. Nothing is random at render
 * time — every choice comes from a hash of the stage id, so the same stage
 * always gets the same art on every device, and web (src/lib/stage-cover.ts)
 * draws the exact same poster from the same maths.
 *
 * The look is the "Ticket stub" in DeHub's monochrome poster style (the App
 * Store and share-card graphics): near-black base, blurred grey light streaks,
 * a dot grid, a hairline frame, // code tags, and a white tear-off stub with
 * the date and a sound barcode. The only colour is the red dot on a live stage.
 *
 * Keep in sync with dehubweb/src/lib/stage-cover.ts.
 */

import type { TFunction } from 'i18next';

export interface StageCoverSource {
  id?: string | null;
  title?: string | null;
  host_username?: string | null;
  host_wallet_address?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  ended_at?: string | null;
  /** 'scheduled' | 'live' | 'ended' (AudioSpace.status). */
  status?: string | null;
}

/** One soft light streak, as fractions of the cover (x, y, w, h) and degrees. */
export interface StageCoverStreak {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  opacity: number;
}

export type StageCoverStatus = 'upcoming' | 'live' | 'replay';

export interface StageCoverModel {
  streaks: StageCoverStreak[];
  /** 0..1 heights for the stub's sound barcode. */
  bars: number[];
  /** Stub date. Empty when the stage has no date. */
  day: string;
  month: string;
  weekday: string;
  time: string;
  title: string;
  host: string;
  status: StageCoverStatus;
  /** `// status = "live"` style tag on the ticket. */
  statusTag: string;
  /** Small print under the barcode. */
  stubLine: string;
}

export const STAGE_COVER_W = 1600;
export const STAGE_COVER_H = 900;

/** FNV-1a, 32 bit. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and identical on every JS engine. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatPart(date: Date, opts: Intl.DateTimeFormatOptions, fallback: string, locale?: string): string {
  try {
    return date.toLocaleString(locale, opts);
  } catch {
    return fallback;
  }
}

export function stageCoverDate(stage: StageCoverSource): Date | null {
  const raw = stage.scheduled_at || stage.started_at || stage.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function stageCoverStatus(stage: StageCoverSource): StageCoverStatus {
  if (stage.status === 'live') return 'live';
  if (stage.status === 'ended' || stage.ended_at) return 'replay';
  return 'upcoming';
}

/** Recording length in whole minutes, or 0 when it can't be told. */
function minutesLong(stage: StageCoverSource): number {
  if (!stage.started_at || !stage.ended_at) return 0;
  const ms = new Date(stage.ended_at).getTime() - new Date(stage.started_at).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.max(1, Math.round(ms / 60000)) : 0;
}

/** `t` words the ticket; `locale` picks the language for the month and weekday (undefined = browser). */
export function buildStageCover(stage: StageCoverSource, t: TFunction, locale?: string): StageCoverModel {
  const seed = hash(stage.id || stage.title || 'dehub-stage');
  const next = rng(seed);

  const streaks = Array.from({ length: 3 }, () => ({
    x: 0.15 + next() * 0.7,
    y: 0.2 + next() * 0.6,
    w: 0.55 + next() * 0.45,
    h: 0.09 + next() * 0.1,
    rotate: Math.round(-55 + next() * 110),
    opacity: 0.16 + next() * 0.16,
  }));

  // Smoothed noise so the barcode reads as sound, not static.
  const bars: number[] = [];
  let level = next();
  for (let i = 0; i < 30; i++) {
    level = level * 0.55 + next() * 0.45;
    const swell = 0.55 + 0.45 * Math.sin((i / 30) * Math.PI * 2.5);
    bars.push(Math.max(0.12, Math.min(1, level * swell + 0.08)));
  }

  const date = stageCoverDate(stage);
  const upper = (s: string) => s.replace('.', '').toUpperCase();
  const day = date ? String(date.getDate()) : '';
  const month = date ? upper(formatPart(date, { month: 'short' }, '', locale)) : '';
  const weekday = date ? upper(formatPart(date, { weekday: 'short' }, '', locale)) : '';
  const time = date ? formatPart(date, { hour: 'numeric', minute: '2-digit' }, '', locale) : '';

  const host = stage.host_username
    ? `@${stage.host_username}`
    : stage.host_wallet_address
      ? `@${stage.host_wallet_address.slice(0, 6)}`
      : '';

  const status = stageCoverStatus(stage);
  const mins = minutesLong(stage);
  const statusTag =
    status === 'live'
      ? `// status = "${t('stageCover.live')}"`
      : status === 'replay'
        ? mins ? `// replay = "${t('stageCover.minutes', { minutes: mins })}"` : `// status = "${t('stageCover.replay')}"`
        : `// status = "${t('stageCover.upcoming')}"`;

  return {
    streaks,
    bars,
    day,
    month,
    weekday,
    time,
    title: (stage.title || '').trim(),
    host,
    status,
    statusTag,
    stubLine: t(status === 'live' ? 'stageCover.onAir' : status === 'replay' ? 'stageCover.recorded' : 'stageCover.admitOne'),
  };
}

/** Title size steps, as a fraction of the cover's width. */
export function stageCoverTitleScale(title: string): number {
  const n = title.length;
  if (n <= 22) return 0.056;
  if (n <= 44) return 0.045;
  if (n <= 72) return 0.037;
  return 0.032;
}
