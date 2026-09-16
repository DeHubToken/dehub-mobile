/**
 * Badge ascension — the motion contract
 * =====================================
 * The mobile half of the same record the web app reads. Beat boundaries,
 * durations and escalation gates are identical on both clients, so a tier
 * tuned in one place is tuned in the other; only the particle counts differ,
 * because every mote here is a real view rather than a pixel on a canvas.
 *
 * There is no Skia in this app, and adding it would mean a native build — the
 * ceremony would then be stuck behind a store release instead of riding the
 * next OTA. So this runs on Reanimated and plain views, and the shatter beat
 * cuts the badge into rectangles rather than the wedges the canvas can clip.
 *
 * @module libs/badgeMotion
 */
import { BADGE_ORDER, badgeImage, canonicalTierName } from "./misc";

/** Beat boundaries as a fraction of runtime. Identical to the web app's. */
export const BEATS = {
  lift: [0, 0.13],
  charge: [0.13, 0.25],
  shatter: [0.25, 0.37],
  converge: [0.37, 0.6],
  form: [0.6, 0.7],
  wave: [0.7, 0.8],
  name: [0.8, 0.92],
  ret: [0.92, 1],
} as const;

export interface BadgeMotion {
  rank: number;
  tier: string;
  /** Metro asset id for the tier artwork. */
  asset: number | undefined;
  intensity: number;
  /** Rectangular fragments the outgoing badge breaks into. Kept to a square
   *  grid so the pieces tile the artwork exactly with no seam. */
  shardGrid: number;
  motes: number;
  shockwaves: number;
  durationMs: number;
  lineKey: string;
  fx: {
    /** The room goes dark. */
    vignette: boolean;
    /** Anamorphic flare across the badge as it forms. */
    streak: boolean;
    /** Expanding halo under the new badge. The web app sweeps searchlights
     *  here; a spoke rig is a dozen more views for a effect nobody reads on a
     *  six-inch screen, so mobile takes the halo instead. */
    halo: boolean;
    flash: boolean;
    /** Bursts, each `sparksPerBurst` views. */
    fireworks: number;
    embers: boolean;
    push: boolean;
  };
}

/** Views, not pixels — the counts are a fraction of the web app's. */
const MOTES_BASE = 26;
const MOTES_RANGE = 30;
export const SPARKS_PER_BURST = 12;
export const EMBER_COUNT = 14;

const LAST = BADGE_ORDER.length - 1;

const LINE_KEYS: Record<string, string> = {
  Crab: "badgeAscension.lines.crab",
  Lobster: "badgeAscension.lines.lobster",
  Piranha: "badgeAscension.lines.piranha",
  Tortoise: "badgeAscension.lines.tortoise",
  Cobra: "badgeAscension.lines.cobra",
  Octopus: "badgeAscension.lines.octopus",
  Crocodile: "badgeAscension.lines.crocodile",
  Dolphin: "badgeAscension.lines.dolphin",
  "Tiger Shark": "badgeAscension.lines.tigerShark",
  "Great White Shark": "badgeAscension.lines.greatWhiteShark",
  "Killer Whale": "badgeAscension.lines.killerWhale",
  "Blue Whale": "badgeAscension.lines.blueWhale",
  Megalodon: "badgeAscension.lines.megalodon",
};

export function badgeMotion(tier: string | null | undefined): BadgeMotion | undefined {
  const name = canonicalTierName(tier);
  if (!name) return undefined;
  const i = BADGE_ORDER.indexOf(name);
  if (i < 0) return undefined;

  const intensity = LAST > 0 ? i / LAST : 0;
  return {
    rank: i + 1,
    tier: name,
    asset: badgeImage(name),
    intensity,
    shardGrid: i >= 8 ? 4 : 3,
    motes: Math.round(MOTES_BASE + intensity * MOTES_RANGE),
    shockwaves: i >= 10 ? 3 : i >= 8 ? 2 : 1,
    durationMs: Math.round(3400 + intensity * 1800),
    lineKey: LINE_KEYS[name] ?? "badgeAscension.lines.crab",
    fx: {
      vignette: i >= 6,
      streak: i >= 6,
      halo: i >= 8,
      flash: i >= 10,
      fireworks: i >= 12 ? 3 : i >= 10 ? 2 : 0,
      embers: i >= 11,
      push: i >= 12,
    },
  };
}

/** True when `to` sits strictly above `from` on the ladder. */
export function isPromotion(from: string | null | undefined, to: string | null | undefined): boolean {
  const a = canonicalTierName(from);
  const b = canonicalTierName(to);
  if (!b) return false;
  const bi = BADGE_ORDER.indexOf(b);
  if (bi < 0) return false;
  if (!a) return true;
  const ai = BADGE_ORDER.indexOf(a);
  return ai >= 0 && bi > ai;
}

/** `10k`, `1m`, `50m` — the threshold beside the coin. */
export function shortDhb(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(1))}m`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}k`;
  }
  return String(Math.round(value));
}
