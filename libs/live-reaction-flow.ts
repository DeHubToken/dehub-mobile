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
}

export const REACTION_STEP_MS = 140;
export const REACTION_LIFETIME_MS = 1500;

/** A small FIFO fountain. Bound both the picture and the backlog during a raid. */
export class ReactionFlowQueue {
  private pending: LiveReactionType[] = [];
  private active: ReactionParticle[] = [];
  private sequence = 0;

  enqueue(value: unknown, weight = 1): void {
    const type = liveReactionType(value);
    if (!type) return;
    const safeWeight = Number.isFinite(weight) ? Math.max(1, Math.min(14, weight)) : 1;
    const count = safeWeight > 1 ? 5 + Math.floor(Math.log2(safeWeight)) * 2 : 3;
    this.pending.push(...Array<LiveReactionType>(count).fill(type));
    // Keep recent applause rather than replaying minutes of stale reactions.
    if (this.pending.length > 600) this.pending.splice(0, this.pending.length - 600);
  }

  tick(now: number): ReactionParticle[] {
    this.active = this.active.filter(item => item.expiresAt > now);
    const count = Math.min(24 - this.active.length, this.pending.length > 30 ? 3 : 1);
    for (let i = 0; i < count && this.pending.length; i++) {
      this.active.push({ id: String(++this.sequence), type: this.pending.shift()!, expiresAt: now + REACTION_LIFETIME_MS });
    }
    return [...this.active];
  }

  get busy(): boolean { return this.pending.length > 0 || this.active.length > 0; }
  remove(id: string): void { this.active = this.active.filter(item => item.id !== id); }
  clear(): void { this.pending = []; this.active = []; }
}
