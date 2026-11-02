/**
 * Self-destructing DM attachments. The server removes the message for both
 * people when the timer runs out, or as soon as the other person has watched
 * a view-once one. Same choices as the backend `src/dm/dm-destruct.ts`.
 */
export type DmDestructChoice = 'view' | 60 | 3600 | 43200 | 86400 | 604800 | 31536000;

export const DESTRUCT_CHOICES: DmDestructChoice[] = ['view', 60, 3600, 43200, 86400, 604800, 31536000];

export interface DmDestruct {
  mode: 'view' | 'time';
  seconds?: number;
  expiresAt?: string;
  destroyedAt?: string;
}

/** Short label for a choice: "1 view", "1 min", "12 hours", "1 week". */
export function destructLabel(c: DmDestructChoice): string {
  switch (c) {
    case 'view': return '1 view';
    case 60: return '1 min';
    case 3600: return '1 hour';
    case 43200: return '12 hours';
    case 86400: return '1 day';
    case 604800: return '1 week';
    case 31536000: return '1 year';
  }
}

/** Tiny label for small chips: "1 view", "1m", "12h", "1w". */
export function destructShort(c: DmDestructChoice): string {
  const map: Record<string, string> = { view: '1 view', 60: '1m', 3600: '1h', 43200: '12h', 86400: '1d', 604800: '1w', 31536000: '1y' };
  return map[String(c)];
}

/** Time left on a timed message, as the chip shows it: "59s", "12m", "5h", "3d". */
export function destructLeft(d: DmDestruct | null | undefined, now = Date.now()): string | null {
  if (!d || d.mode !== 'time' || !d.expiresAt) return null;
  const s = Math.max(0, Math.round((new Date(d.expiresAt).getTime() - now) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** The choice from what is stored on a message (used for the optimistic copy). */
export function destructFromChoice(c: DmDestructChoice | null | undefined, now = Date.now()): DmDestruct | null {
  if (!c) return null;
  if (c === 'view') return { mode: 'view' };
  return { mode: 'time', seconds: c, expiresAt: new Date(now + c * 1000).toISOString() };
}
