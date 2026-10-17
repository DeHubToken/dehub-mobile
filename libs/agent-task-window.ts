/** Builds the exact "every post in a time period" instruction the task runner parses without the planner. */
export type WindowPreset = 'today' | 'last24h' | 'last7d' | 'next7d' | 'custom';
export type WindowAction = 'view' | 'like' | 'reply';
export const WINDOW_PRESETS: WindowPreset[] = ['today', 'last24h', 'last7d', 'next7d', 'custom'];
export const WINDOW_ACTIONS: WindowAction[] = ['view', 'like', 'reply'];
const DAY = 86400000;
/** Matches LIVE_WINDOW_MAX_DAYS in the task runner. */
export const WINDOW_MAX_DAYS_AHEAD = 31;

/** "2026-10-17 18:30" (or with a T) in the phone's local time; a bare date means midnight. */
export function parseLocal(value: string): Date {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (!match) return new Date(NaN);
  const [, y, m, d, h = '0', min = '0'] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(min));
  return date.getMonth() === Number(m) - 1 && date.getDate() === Number(d) ? date : new Date(NaN);
}

export function windowRange(preset: WindowPreset, custom: { from: string; to: string }, now = new Date()): { from: Date; to: Date } | null {
  if (preset === 'custom') {
    const from = parseLocal(custom.from), to = parseLocal(custom.to);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to || to.getTime() > now.getTime() + WINDOW_MAX_DAYS_AHEAD * DAY) return null;
    return { from, to };
  }
  if (preset === 'today') { const from = new Date(now); from.setHours(0, 0, 0, 0); return { from, to: new Date(from.getTime() + DAY) }; }
  if (preset === 'last24h') return { from: new Date(now.getTime() - DAY), to: now };
  if (preset === 'last7d') return { from: new Date(now.getTime() - 7 * DAY), to: now };
  return { from: now, to: new Date(now.getTime() + 7 * DAY) };
}

export function windowPrompt(range: { from: Date; to: Date }, actions: WindowAction[], replyStyle: string): string {
  const ordered = WINDOW_ACTIONS.filter(action => actions.includes(action));
  return [`Every post from ${range.from.toISOString()} to ${range.to.toISOString()}`, `Actions: ${ordered.join(', ')}`,
    ...(ordered.includes('reply') ? [`Reply style: ${replyStyle.trim().replace(/\s+/g, ' ').slice(0, 500)}`] : [])].join('\n');
}
