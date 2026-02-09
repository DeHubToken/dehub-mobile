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

export function formatNotificationDate(isoDateString: Date | string) {
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
 * - 1 week ago / 3 weeks ago
 * - 1 month ago / 6 months ago
 * - 1 year ago / 3 years ago
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
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * Smart chat timestamp for MessageBubble long-press:
 * - For messages newer than `thresholdHours` (default 6h), show relative (e.g., "45 mins ago").
 * - Same day (but older than threshold): show time only (e.g., "4:23 PM").
 * - Yesterday: "4:23 PM, Yesterday".
 * - Within 7 days: "4:23 PM, Wed".
 * - Same year: "4:23 PM, Feb 9".
 * - Different year: "4:23 PM, Feb 9, 2024".
 */
export function formatChatTimeSmart(
  input?: string | number | Date | null,
  thresholdHours = 6
): string {
  if (!input) return 'now';
  const d = input instanceof Date ? input : new Date(input);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 'now';
  const now = new Date();
  const diffMs = now.getTime() - t;
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
  const timeStr = `${h12}:${mmStr} ${ampm}`;
  // Same calendar day → just time
  const sameDay = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) return timeStr;
  // Yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return `${timeStr}, Yesterday`;
  // Within last 7 days → show day name
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) {
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    return `${timeStr}, ${dayName}`;
  }
  // Same year → show month & day
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (d.getFullYear() === now.getFullYear()) {
    return `${timeStr}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
  }
  // Different year → show full date
  return `${timeStr}, ${monthNames[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
export const DateUtil = { secondsToHMMSS, msToHHMMSS, formatJoinedDate, formatNotificationDate, formatRelativeFromNow, formatChatTimeSmart };
export default DateUtil;
