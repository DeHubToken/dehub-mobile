/**
 * Generated stage covers
 * ======================
 * A stage without an uploaded cover gets a poster drawn in code from its own
 * details: title, start time and host. Nothing is random at render time —
 * every choice comes from a hash of the stage id, so the same stage always
 * gets the same art on every device, and web (src/lib/stage-cover.ts) draws
 * the exact same poster from the same maths.
 *
 * The look follows the DeHub banners: near-black base, two soft colour glows,
 * broadcast rings around a date disc, and a waveform along the bottom edge.
 *
 * Keep in sync with dehubweb/src/lib/stage-cover.ts.
 */

export interface StageCoverSource {
  id?: string | null;
  title?: string | null;
  host_username?: string | null;
  host_wallet_address?: string | null;
  scheduled_at?: string | null;
  started_at?: string | null;
  created_at?: string | null;
}

export interface StageCoverPalette {
  /** Main glow, behind the rings. */
  a: string;
  /** Second glow, opposite corner. */
  b: string;
  /** Light accent for the brand line and ring highlight. */
  ink: string;
}

export interface StageCoverModel {
  palette: StageCoverPalette;
  /** Ring centre, in viewBox units (1600 x 900). */
  cx: number;
  cy: number;
  rings: { r: number; opacity: number }[];
  /** Which ring gets the bright accent arc, and where it starts (degrees). */
  accentRing: number;
  accentStart: number;
  /** 0..1 heights for the bottom waveform. */
  bars: number[];
  /** Big numeral and month on the disc. Empty when the stage has no date. */
  day: string;
  month: string;
  /** "Thu, Oct 23 · 8:00 PM" style line. */
  when: string;
  title: string;
  host: string;
}

export const STAGE_COVER_W = 1600;
export const STAGE_COVER_H = 900;

const PALETTES: StageCoverPalette[] = [
  { a: '#7c3aed', b: '#ec4899', ink: '#e9d5ff' }, // violet / pink
  { a: '#2563eb', b: '#06b6d4', ink: '#bae6fd' }, // blue / cyan
  { a: '#db2777', b: '#f59e0b', ink: '#fde68a' }, // rose / amber
  { a: '#059669', b: '#22d3ee', ink: '#a7f3d0' }, // emerald / cyan
  { a: '#dc2626', b: '#f97316', ink: '#fed7aa' }, // red / orange
  { a: '#4f46e5', b: '#d946ef', ink: '#f5d0fe' }, // indigo / fuchsia
  { a: '#0d9488', b: '#a3e635', ink: '#d9f99d' }, // teal / lime
  { a: '#9333ea', b: '#3b82f6', ink: '#c7d2fe' }, // purple / blue
];

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

/** `locale` picks the language for the month and weekday; undefined = browser. */
export function buildStageCover(stage: StageCoverSource, locale?: string): StageCoverModel {
  const seed = hash(stage.id || stage.title || 'dehub-stage');
  const next = rng(seed);

  const palette = PALETTES[seed % PALETTES.length];
  const cx = Math.round(STAGE_COVER_W * (0.72 + next() * 0.1));
  const cy = Math.round(STAGE_COVER_H * (0.4 + next() * 0.16));

  const ringCount = 4 + Math.floor(next() * 3);
  const gap = 78 + Math.floor(next() * 30);
  const rings = Array.from({ length: ringCount }, (_, i) => ({
    r: 150 + i * gap,
    opacity: Math.max(0.06, 0.34 - i * 0.06),
  }));
  const accentRing = Math.floor(next() * Math.min(3, ringCount));
  const accentStart = Math.floor(next() * 360);

  // Smoothed noise so the waveform reads as sound, not static.
  const bars: number[] = [];
  let level = next();
  for (let i = 0; i < 64; i++) {
    level = level * 0.55 + next() * 0.45;
    const swell = 0.55 + 0.45 * Math.sin((i / 64) * Math.PI * (1.5 + (seed % 3)));
    bars.push(Math.max(0.08, Math.min(1, level * swell + 0.08)));
  }

  const date = stageCoverDate(stage);
  const day = date ? String(date.getDate()) : '';
  const month = date
    ? formatPart(date, { month: 'short' }, '', locale).replace('.', '').toUpperCase()
    : '';
  const when = date
    ? `${formatPart(date, { weekday: 'short', month: 'short', day: 'numeric' }, date.toDateString(), locale)} · ${formatPart(
        date,
        { hour: 'numeric', minute: '2-digit' },
        '',
        locale,
      )}`
    : '';

  const host = stage.host_username
    ? `@${stage.host_username}`
    : stage.host_wallet_address
      ? `@${stage.host_wallet_address.slice(0, 6)}`
      : '';

  return {
    palette,
    cx,
    cy,
    rings,
    accentRing,
    accentStart,
    bars,
    day,
    month,
    when,
    title: (stage.title || '').trim(),
    host,
  };
}

/** SVG arc path for a ring segment, used for the accent highlight. */
export function stageCoverArc(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = toXY(startDeg);
  const [x2, y2] = toXY(startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Title size steps, as a fraction of the cover's width. */
export function stageCoverTitleScale(title: string): number {
  const n = title.length;
  if (n <= 22) return 0.062;
  if (n <= 44) return 0.052;
  if (n <= 72) return 0.044;
  return 0.038;
}
