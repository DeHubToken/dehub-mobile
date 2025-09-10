// Date & time utilities
// (Filename uses 'utl' per user instruction; consider aliasing if needed later.)

import { pad } from './numbers.util';

/** Convert seconds to H:MM:SS or MM:SS */
export function secondsToHMMSS(totalSeconds?: number): string | undefined {
  if (totalSeconds === undefined || totalSeconds === null) return undefined;
  if (typeof totalSeconds !== 'number' || Number.isNaN(totalSeconds)) return undefined;
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** Generic duration formatter (ms) -> HH:MM:SS */
export function msToHHMMSS(ms?: number): string | undefined {
  if (ms === undefined || ms === null) return undefined;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Format account creation date into: Joined at Month Day, Year */
export function formatJoinedDate(createdAt?: string | null): string | null {
  if (!createdAt) return null;
  try {
    const d = new Date(createdAt);
    if (isNaN(d.getTime())) return null;
    const month = d.toLocaleString(undefined, { month: 'long' });
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${day}, ${year}`;
  } catch {
    return null;
  }
}

export const DateUtil = { secondsToHMMSS, msToHHMMSS, formatJoinedDate };
export default DateUtil;
