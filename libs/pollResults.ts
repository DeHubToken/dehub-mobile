/** Shared by app poll cards and anonymous share images. */
export interface PollTiming { isActive: boolean; isExpired?: boolean; expiresAt?: string | null }

export function pollHasEnded(poll: PollTiming, now = Date.now()): boolean {
  return !poll.isActive || !!poll.isExpired
    || (!!poll.expiresAt && new Date(poll.expiresAt).getTime() <= now);
}

export function pollVotePercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function pollOptionWins(count: number, topCount: number, ended: boolean): boolean {
  return ended && topCount > 0 && count === topCount;
}
