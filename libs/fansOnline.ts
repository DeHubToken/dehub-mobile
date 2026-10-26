/**
 * The fans-online grid from GET /api/scheduled_posts/fans_online: 7 x 24
 * counts of distinct followers watching, in UTC with Sunday first. These turn
 * it into the viewer's own clock and pick the busiest hour still ahead.
 * Kept identical to dehubweb src/lib/schedule/fansOnline.ts.
 */

const WEEK_HOURS = 7 * 24;

/** The UTC grid shifted onto local time: [local weekday][local hour]. */
export function toLocalGrid(utc: number[][], now: Date = new Date()): number[][] {
  const offsetHours = Math.round(-now.getTimezoneOffset() / 60);
  const local = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const slot = (((dow * 24 + hour + offsetHours) % WEEK_HOURS) + WEEK_HOURS) % WEEK_HOURS;
      local[Math.floor(slot / 24)][slot % 24] = utc[dow]?.[hour] ?? 0;
    }
  }
  return local;
}

/**
 * The busiest hour in the next week that starts after `earliest`, on the
 * hour. Ties go to the sooner one. Null when nobody was watching at all.
 */
export function bestTime(local: number[][], earliest: number, now: Date = new Date()): Date | null {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  let best: Date | null = null;
  let bestCount = 0;
  for (let i = 0; i < WEEK_HOURS; i++) {
    const at = new Date(start.getFullYear(), start.getMonth(), start.getDate(), start.getHours() + i);
    if (at.getTime() <= earliest) continue;
    const count = local[at.getDay()]?.[at.getHours()] ?? 0;
    if (count > bestCount) {
      best = at;
      bestCount = count;
    }
  }
  return best;
}
