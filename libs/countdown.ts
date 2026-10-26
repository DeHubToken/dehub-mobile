import { useEffect, useState } from 'react';

/**
 * "2d 6h", "3h 20m", "45m": how long until a scheduled start, for the
 * countdown on upcoming Stage and Live cards. Null once it is due.
 * Kept identical to dehubweb src/lib/schedule/countdown.ts.
 */
export function countdownParts(at: Date | null, now: number = Date.now()): string | null {
  if (!at) return null;
  const minutes = Math.ceil((at.getTime() - now) / 60_000);
  if (minutes <= 0) return null;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/** Re-renders once a minute so a countdown stays current. */
export function useMinuteTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
