export const LIVE_REACTION_EMOJI = {
  LIKE: '👍', HEART: '❤️', CELEBRATE: '🎉', SUPPORT: '✊', LAUGH: '😂',
  HOT: '🔥', HUNDRED: '💯', SAD: '😢', CRY: '😭', POO: '💩', DISLIKE: '👎',
} as const;
export type LiveReactionType = keyof typeof LIVE_REACTION_EMOJI;

export function liveReactionType(value: unknown): LiveReactionType | null {
  if (typeof value !== 'string') return null;
  const key = value.toUpperCase();
  const aliases: Record<string, LiveReactionType> = { LOVE: 'HEART', RESPECT: 'SUPPORT', LOL: 'LAUGH' };
  if (Object.prototype.hasOwnProperty.call(aliases, key)) return aliases[key];
  return Object.prototype.hasOwnProperty.call(LIVE_REACTION_EMOJI, key) ? key as LiveReactionType : null;
}

export interface ReactionParticle {
  id: string;
  type: LiveReactionType;
  expiresAt: number;
  /** Sent by a badge holder: drawn a size up. */
  big?: boolean;
}

export const REACTION_STEP_MS = 140;

/**
 * How each reaction moves. One table drives web and app, so a 🔥 looks the
 * same on every screen. The old flow was one 22px emoji drifting 120px for
 * 1.5s in a small corner box, which on a phone read as nothing happening.
 *
 * - duration: ms from pop-in to gone
 * - sway: px of side-to-side drift at the top of the climb
 * - waves: how many side-to-side swings over the climb
 * - pop: scale at the peak of the pop-in
 * - spin: full turn(s) over the climb (degrees), or 0
 * - wobble: degrees of rock either way, when it doesn't spin
 * - pulse: beats over the climb (a heart beating, a flame flickering), or 0
 */
export interface ReactionMotion {
  duration: number; sway: number; waves: number; pop: number;
  spin: number; wobble: number; pulse: number; pulseDepth: number;
}

export const REACTION_MOTION: Record<LiveReactionType, ReactionMotion> = {
  LIKE:      { duration: 2400, sway: 12, waves: 1,   pop: 1.45, spin: 0,   wobble: 8,  pulse: 0, pulseDepth: 0 },
  HEART:     { duration: 2800, sway: 22, waves: 1.5, pop: 1.35, spin: 0,   wobble: 6,  pulse: 4, pulseDepth: 0.14 },
  CELEBRATE: { duration: 2300, sway: 18, waves: 1,   pop: 1.5,  spin: 360, wobble: 0,  pulse: 0, pulseDepth: 0 },
  SUPPORT:   { duration: 2400, sway: 8,  waves: 1,   pop: 1.55, spin: 0,   wobble: 10, pulse: 2, pulseDepth: 0.1 },
  LAUGH:     { duration: 2600, sway: 16, waves: 2,   pop: 1.4,  spin: 0,   wobble: 22, pulse: 0, pulseDepth: 0 },
  HOT:       { duration: 2000, sway: 7,  waves: 2.5, pop: 1.4,  spin: 0,   wobble: 6,  pulse: 8, pulseDepth: 0.1 },
  HUNDRED:   { duration: 2400, sway: 12, waves: 1,   pop: 1.65, spin: 0,   wobble: 12, pulse: 0, pulseDepth: 0 },
  SAD:       { duration: 3200, sway: 10, waves: 1,   pop: 1.2,  spin: 0,   wobble: 5,  pulse: 0, pulseDepth: 0 },
  CRY:       { duration: 3200, sway: 14, waves: 1.5, pop: 1.25, spin: 0,   wobble: 8,  pulse: 3, pulseDepth: 0.08 },
  POO:       { duration: 2600, sway: 14, waves: 2,   pop: 1.45, spin: 0,   wobble: 18, pulse: 0, pulseDepth: 0 },
  DISLIKE:   { duration: 2400, sway: 8,  waves: 1,   pop: 1.3,  spin: 0,   wobble: 8,  pulse: 0, pulseDepth: 0 },
};

/** Emoji size in px; badge holders' reactions are drawn a size up. */
export const REACTION_SIZE = 32;
export const REACTION_SIZE_BIG = 40;
/** Width of the lane the reactions climb, on the right edge of the picture. */
export const REACTION_LANE_WIDTH = 120;

export interface ReactionPose {
  /** px from the particle's start column, positive is right */
  x: number;
  /** 0 at the bottom of the lane, 1 at the top */
  rise: number;
  /** degrees */
  rotate: number;
  scale: number;
  opacity: number;
}

/** Where a particle sits `t` (0..1) of the way through its climb. */
export function reactionPose(type: LiveReactionType, seed: number, t: number): ReactionPose {
  // The app runs this on the UI thread inside an animated style.
  'worklet';
  const m = REACTION_MOTION[type] ?? REACTION_MOTION.LIKE;
  const p = Math.max(0, Math.min(1, t));
  const phase = (seed * 2.39996) % (Math.PI * 2);
  const side = seed % 2 ? 1 : -1;
  // Pop in past full size, settle, then shrink a little near the top.
  let scale = p < 0.07 ? 0.3 + (m.pop - 0.3) * (p / 0.07)
    : p < 0.17 ? m.pop + (1 - m.pop) * ((p - 0.07) / 0.1)
    : p > 0.8 ? 1 - 0.25 * ((p - 0.8) / 0.2)
    : 1;
  if (m.pulse) scale *= 1 + m.pulseDepth * Math.sin(p * Math.PI * 2 * m.pulse);
  const rotate = m.spin
    ? side * m.spin * (1 - Math.pow(1 - p, 2))
    : m.wobble * Math.sin(p * Math.PI * 2 * 2 + phase);
  return {
    x: m.sway * (0.35 + 0.65 * p) * Math.sin(p * Math.PI * 2 * m.waves + phase),
    // Quick off the button, easing out as it nears the top.
    rise: 1 - Math.pow(1 - p, 1.7),
    rotate,
    scale,
    opacity: p < 0.05 ? p / 0.05 : p > 0.72 ? Math.max(0, (1 - p) / 0.28) : 1,
  };
}

/** The column a particle starts in, px from the lane's right edge. */
export function reactionColumn(seed: number): number {
  return 6 + (seed * 37 % 5) * 14;
}

const MAX_ACTIVE = 30;

/** A small FIFO fountain. Bound both the picture and the backlog during a raid. */
export class ReactionFlowQueue {
  private pending: { type: LiveReactionType; big: boolean }[] = [];
  private active: ReactionParticle[] = [];
  private sequence = 0;

  enqueue(value: unknown, weight = 1): void {
    const type = liveReactionType(value);
    if (!type) return;
    const safeWeight = Number.isFinite(weight) ? Math.max(1, Math.min(14, weight)) : 1;
    const count = safeWeight > 1 ? 5 + Math.floor(Math.log2(safeWeight)) * 2 : 3;
    for (let i = 0; i < count; i++) this.pending.push({ type, big: safeWeight > 1 });
    // Keep recent applause rather than replaying minutes of stale reactions.
    if (this.pending.length > 600) this.pending.splice(0, this.pending.length - 600);
  }

  tick(now: number): ReactionParticle[] {
    this.active = this.active.filter(item => item.expiresAt > now);
    const count = Math.min(MAX_ACTIVE - this.active.length, this.pending.length > 30 ? 3 : 1);
    for (let i = 0; i < count && this.pending.length; i++) {
      const next = this.pending.shift()!;
      this.active.push({ id: String(++this.sequence), type: next.type, big: next.big, expiresAt: now + REACTION_MOTION[next.type].duration });
    }
    return [...this.active];
  }

  get busy(): boolean { return this.pending.length > 0 || this.active.length > 0; }
  remove(id: string): void { this.active = this.active.filter(item => item.id !== id); }
  clear(): void { this.pending = []; this.active = []; }
}
