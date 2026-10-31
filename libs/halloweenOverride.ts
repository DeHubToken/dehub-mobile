/**
 * Halloween 2026: everyone sees the Horror theme until midnight on their own
 * clock. Nothing is saved; the saved theme paints again on 1 Nov. Picking a
 * theme during the day opts this device out. Mirrors dehubweb
 * src/lib/halloween-override.ts.
 */
export const HALLOWEEN_THEME = 'horror' as const;

export function isHalloweenDay(now: Date = new Date()): boolean {
  return now.getFullYear() === 2026 && now.getMonth() === 9 && now.getDate() === 31;
}

/** Milliseconds until the next local midnight (at least 1s). */
export function msUntilLocalMidnight(now: Date = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
