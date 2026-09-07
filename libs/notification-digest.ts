/**
 * Smart notifications — combining a pile-up, and pacing it
 * ========================================================
 *
 * Mobile counterpart of web's `src/lib/notification-digest.ts`, same rules and
 * the same storage key shape so the two clients behave identically for the
 * same reader.
 *
 * **Combining.** A pile of events is described as a pile — "14 new messages,
 * @ben and 4 others" — rather than announced one card at a time. A chat is a
 * burst by nature, and a card per line is a tray the reader clears instead of
 * reads.
 *
 * **Pacing.** `claimAllowance` is a rolling-hour budget the reader sets, spent
 * by *notifications* and never by messages. Running out delays the next card;
 * it never drops what that card would have said, because the buffer keeps
 * growing behind the limit and the next card carries all of it. That is what
 * makes a low limit informative rather than lossy.
 *
 * MMKV rather than AsyncStorage: the spend is read and written inside a socket
 * handler that has to decide now, and an app restart must not mint a fresh
 * hour's allowance — a restart is exactly what a reader does when a raid
 * starts.
 *
 * @module libs/notification-digest
 */

import { storage } from './storage';

/** The window an allowance is measured over. "Per hour" means this. */
export const ALLOWANCE_WINDOW_MS = 60 * 60 * 1000;

/** How many distinct names a digest line names before it says "and N others". */
export const DIGEST_NAME_LIMIT = 3;

const SPEND_PREFIX = 'dehub.notify.spend::';

/**
 * The timestamps of the notifications this channel has already fired inside
 * the window. Anything older is dropped on read, so the stored array cannot
 * outgrow the limit by more than one pass.
 */
function readSpend(channel: string, now: number): number[] {
  let raw: string | undefined;
  try {
    raw = storage.getString(SPEND_PREFIX + channel);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      // A clock that has gone backwards (a device waking, a manual change)
      // would otherwise leave stamps "in the future" that never expire.
      .filter((ts) => ts <= now && now - ts < ALLOWANCE_WINDOW_MS)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function writeSpend(channel: string, stamps: number[]) {
  try {
    storage.set(SPEND_PREFIX + channel, JSON.stringify(stamps));
  } catch {
    /* storage disabled — the pacing of this session still holds */
  }
}

export interface AllowanceState {
  /** Notifications fired inside the current window. */
  used: number;
  /** How many more may fire right now. */
  remaining: number;
  /**
   * When the next slot frees up, or null while one is free. This is what a
   * caller should wait until, rather than retrying on a timer of its own.
   */
  nextAt: number | null;
}

/** What the budget looks like without spending any of it. */
export function readAllowance(
  channel: string,
  limit: number,
  now: number = Date.now(),
): AllowanceState {
  const stamps = readSpend(channel, now);
  const used = stamps.length;
  const remaining = Math.max(0, limit - used);
  // The oldest stamp is the one whose expiry frees the next slot. With the
  // limit already exceeded (the reader lowered it mid-hour), it is the
  // (used - limit + 1)th oldest that has to fall out.
  const freeing = used >= limit ? stamps[used - limit] : undefined;
  return {
    used,
    remaining,
    nextAt: remaining > 0 || freeing === undefined ? null : freeing + ALLOWANCE_WINDOW_MS,
  };
}

/**
 * Take one slot if there is one. Returns false when the budget is spent — the
 * caller holds on to whatever it was going to say and tries again after
 * `readAllowance().nextAt`.
 */
export function claimAllowance(
  channel: string,
  limit: number,
  now: number = Date.now(),
): boolean {
  const stamps = readSpend(channel, now);
  if (stamps.length >= limit) {
    writeSpend(channel, stamps);
    return false;
  }
  stamps.push(now);
  writeSpend(channel, stamps);
  return true;
}

/** Forget this channel's spend. Used when a reader turns the channel off. */
export function resetAllowance(channel: string) {
  try {
    storage.delete(SPEND_PREFIX + channel);
  } catch {
    /* nothing stored, nothing to clear */
  }
}

export interface DigestItem {
  /** Who it was from — a display name or handle, already formatted. */
  from?: string | null;
  /** The line itself. The newest non-empty one is what a digest quotes. */
  text?: string | null;
  /**
   * Set when the item is aimed at the reader personally (a mention, a reply).
   * A digest leads with the newest of these instead of the newest item, so a
   * message addressed to you is not buried under the noise it arrived in.
   */
  personal?: boolean;
}

export interface Digest {
  /** Everything in the pile, including what the summary does not name. */
  count: number;
  /** Distinct senders in arrival order, capped at the name limit. */
  names: string[];
  /** Senders past `names` — the "and N others" number. */
  otherNames: number;
  /** The line worth quoting: the newest personal item, else the newest item. */
  latest: string;
  /** Whether `latest` came from an item aimed at the reader. */
  latestIsPersonal: boolean;
}

/**
 * Describe a pile of buffered items in the shape a single notification needs.
 *
 * Pure and synchronous so the wording can be unit-tested without a device and
 * without faking expo-notifications; the caller turns this into `t()` calls,
 * because everything here has to render in 110 languages.
 *
 * @param items In arrival order, oldest first.
 */
export function buildDigest(
  items: DigestItem[],
  nameLimit: number = DIGEST_NAME_LIMIT,
): Digest {
  const names: string[] = [];
  const seen = new Set<string>();
  let latest = '';
  let latestPersonal = '';

  for (const item of items) {
    const from = item.from?.trim();
    if (from) {
      const dedupeOn = from.toLowerCase();
      if (!seen.has(dedupeOn)) {
        seen.add(dedupeOn);
        names.push(from);
      }
    }
    const text = item.text?.trim();
    if (text) {
      latest = text;
      if (item.personal) latestPersonal = text;
    }
  }

  return {
    count: items.length,
    names: names.slice(0, nameLimit),
    otherNames: Math.max(0, names.length - nameLimit),
    latest: latestPersonal || latest,
    latestIsPersonal: Boolean(latestPersonal),
  };
}
