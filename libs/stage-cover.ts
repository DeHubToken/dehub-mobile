/**
 * Generated stage covers
 * ======================
 * A stage without an uploaded cover gets a poster drawn in code from its own
 * details: title, start time, host and status. Nothing is random at render
 * time — every choice comes from a hash of the stage id, so the same stage
 * always gets the same art on every device, and web (src/lib/stage-cover.ts)
 * draws the exact same poster from the same maths.
 *
 * The look is "Chrome Mic", built from DeHub's banner kit (the og-image and
 * guide banners): a smoky monochrome backdrop, grain, a dot grid, a hairline
 * frame, the DEHUB wordmark, a chrome title with //STATUS above it, and the 3D
 * chrome mic on the right. The only colour is the red dot on a live stage.
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

export type StageCoverStatus = 'upcoming' | 'live' | 'replay';

/** A small four-point sparkle, as fractions of the cover and a size in cqw. */
export interface StageCoverSparkle {
  x: number;
  y: number;
  size: number;
}

export interface StageCoverModel {
  /** One of STAGE_COVER_BACKGROUNDS: a smoky backdrop from the brand kit. */
  background: string;
  /** Degrees the chrome mic leans; negative leans left. */
  tilt: number;
  /** A replay's mic faces the other way. */
  flip: boolean;
  sparkles: StageCoverSparkle[];
  /** Start date parts. Empty when the stage has no date. */
  day: string;
  month: string;
  weekday: string;
  time: string;
  /** Weekday, date and time in one, e.g. "Fri, Oct 23, 7:00 PM". */
  when: string;
  title: string;
  host: string;
  status: StageCoverStatus;
  /** `//LIVE` style line above the title. */
  statusTag: string;
  /** `when = …` or `length = …` after the host, or '' when there is nothing to say. */
  detail: string;
}

/**
 * The smoky backdrops a stage can get, from the brand kit (public/brand-kit/bg
 * on web, assets/stage-cover in the app). Order matters: the stage id picks
 * by index, so only ever append.
 */
export const STAGE_COVER_BACKGROUNDS = [
  'bg-04', 'bg-07', 'bg-10', 'bg-11', 'bg-13', 'bg-14',
  'bg-16', 'bg-20', 'bg-23', 'bg-26', 'bg-37', 'bg-42',
] as const;

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

/** `t` words the cover; `locale` picks the language for the date (undefined = browser). */
export function buildStageCover(stage: StageCoverSource, t: TFunction, locale?: string): StageCoverModel {
  const seed = hash(stage.id || stage.title || 'dehub-stage');
  const next = rng(seed);

  const background = STAGE_COVER_BACKGROUNDS[Math.floor(next() * STAGE_COVER_BACKGROUNDS.length)];
  const tilt = Math.round(4 + next() * 8);
  const sparkles = [
    { x: 0.5 + next() * 0.12, y: 0.16 + next() * 0.12, size: 2.4 },
    { x: 0.9 + next() * 0.04, y: 0.3 + next() * 0.1, size: 1.4 },
  ];

  const date = stageCoverDate(stage);
  const upper = (s: string) => s.replace('.', '').toUpperCase();
  const day = date ? String(date.getDate()) : '';
  const month = date ? upper(formatPart(date, { month: 'short' }, '', locale)) : '';
  const weekday = date ? upper(formatPart(date, { weekday: 'short' }, '', locale)) : '';
  const time = date ? formatPart(date, { hour: 'numeric', minute: '2-digit' }, '', locale) : '';
  const when = date
    ? formatPart(date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, '', locale)
    : '';

  const host = stage.host_username
    ? `@${stage.host_username}`
    : stage.host_wallet_address
      ? `@${stage.host_wallet_address.slice(0, 6)}`
      : '';

  const status = stageCoverStatus(stage);
  const mins = minutesLong(stage);
  const statusTag = `//${t(status === 'live' ? 'stageCover.live' : status === 'replay' ? 'stageCover.replay' : 'stageCover.upcoming').toUpperCase()}`;
  const detail =
    status === 'replay'
      ? mins ? `length = ${t('stageCover.minutes', { minutes: mins })}` : ''
      : status === 'upcoming' && when ? `when = ${when}` : '';

  return {
    background,
    tilt: status === 'replay' ? -tilt : tilt,
    flip: status === 'replay',
    sparkles,
    day,
    month,
    weekday,
    time,
    when,
    title: (stage.title || '').trim(),
    host,
    status,
    statusTag,
    detail,
  };
}

/** Title size steps, as a fraction of the cover's width. */
export function stageCoverTitleScale(title: string): number {
  const n = title.length;
  if (n <= 16) return 0.084;
  if (n <= 30) return 0.064;
  if (n <= 48) return 0.052;
  return 0.039;
}
