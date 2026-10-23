/**
 * Live polls, as the stream API sends them: the whole poll every time, on
 * open, as votes come in and on close. See dehub-stream-backend
 * src/live-overlay/live-polls.ts. The twin of dehubweb src/lib/live-overlay/polls.ts.
 */

export interface LivePoll {
  id: string;
  streamId: string;
  question: string;
  options: Array<{ text: string; votes: number }>;
  total: number;
  /** When voting stops (ISO). For a poll closed early, when it was closed. */
  endsAt: string;
  closed: boolean;
}

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 5;
export const POLL_QUESTION_MAX = 120;
export const POLL_OPTION_MAX = 50;
/** Seconds a creator can run a poll for. */
export const POLL_DURATIONS = [30, 60, 120, 300, 600] as const;

/** A poll from the wire, or null if it is not one. */
export function parsePoll(raw: unknown): LivePoll | null {
  const p = raw as Partial<LivePoll> | null | undefined;
  if (!p || typeof p.id !== "string" || typeof p.question !== "string" || !Array.isArray(p.options)) return null;
  return {
    id: p.id,
    streamId: String(p.streamId ?? ""),
    question: p.question,
    options: p.options.map((o) => ({ text: String(o?.text ?? ""), votes: Math.max(0, Number(o?.votes) || 0) })),
    total: Math.max(0, Number(p.total) || 0),
    endsAt: String(p.endsAt ?? ""),
    closed: !!p.closed,
  };
}

/** Open on this device's clock too: a poll stops taking votes when its time is up, update or not. */
export function isPollOpen(poll: LivePoll, now = Date.now()): boolean {
  return !poll.closed && new Date(poll.endsAt).getTime() > now;
}

/** Whole-number shares that add up to 100, so the bars never read 33 + 33 + 33. */
export function pollShares(poll: LivePoll): number[] {
  if (!poll.total) return poll.options.map(() => 0);
  const exact = poll.options.map((o) => (o.votes / poll.total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    if (poll.options[i].votes > 0) {
      floors[i] += 1;
      left -= 1;
    }
  }
  return floors;
}

/** The option or options in the lead, once anyone has voted. */
export function pollLeaders(poll: LivePoll): Set<number> {
  const top = Math.max(0, ...poll.options.map((o) => o.votes));
  return new Set(top > 0 ? poll.options.flatMap((o, i) => (o.votes === top ? [i] : [])) : []);
}

/** A stand-in poll for Live Studio's preview, so the widget can be placed before going live. */
export function samplePoll(question: string, options: string[]): LivePoll {
  const votes = [12, 7, 4, 2, 1];
  const opts = options.map((text, i) => ({ text, votes: votes[i] ?? 0 }));
  return {
    id: "sample",
    streamId: "",
    question,
    options: opts,
    total: opts.reduce((a, o) => a + o.votes, 0),
    endsAt: new Date(Date.now() + 90_000).toISOString(),
    closed: false,
  };
}
