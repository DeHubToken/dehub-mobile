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

function formatTime(date: Date) {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
  const formattedMinutes = minutes < 10 ? "0" + minutes : minutes;
  return `${formattedHours}:${formattedMinutes}${ampm}`;
}

export function formatNotificationDate(isoDateString: Date) {
  const date = new Date(isoDateString);
  const now = new Date();
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  if (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  ) {
    return formatTime(date) + ", Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return formatTime(date) + ", Yesterday";
  }

  return formatTime(date) + ", " + daysOfWeek[date.getDay()];
}
/**
 * Relative time formatter for chat/DM contexts.
 * Returns human strings like:
 * - now
 * - 1 min ago / 2 mins ago
 * - 1 hour ago / 3 hours ago
 * - 1 day ago / 5 days ago
 */
export function formatRelativeFromNow(input?: string | number | Date | null): string {
  if (!input) return 'now';
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 'now';
  const diffMs = Math.max(0, Date.now() - t);
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Smart chat timestamp:
 * - For messages newer than `thresholdHours` (default 6h), show relative (e.g., "45 mins ago", "2 hours ago").
 * - For older messages, show absolute local time in h:mm am/pm (e.g., "4:23 am").
 */
export function formatChatTimeSmart(
  input?: string | number | Date | null,
  thresholdHours = 6
): string {
  if (!input) return 'now';
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 'now';
  const diffMs = Date.now() - t;
  const thresholdMs = Math.max(0, thresholdHours) * 3600 * 1000;
  if (diffMs < thresholdMs) {
    return formatRelativeFromNow(d);
  }
  // Absolute local time in h:mm am/pm
  const hh = d.getHours();
  const mm = d.getMinutes();
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  const mmStr = mm < 10 ? `0${mm}` : String(mm);
  return `${h12}:${mmStr} ${ampm}`;
}
export const DateUtil = { secondsToHMMSS, msToHHMMSS, formatJoinedDate, formatNotificationDate, formatRelativeFromNow, formatChatTimeSmart };
export default DateUtil;
