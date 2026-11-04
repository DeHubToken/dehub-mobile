/**
 * Notices someone unfollowing people who never followed them back, so the app
 * can offer to clear the rest in one go. Same rules as web
 * (src/lib/non-follower-streak.ts): two non-followers in a row within ten
 * minutes raise the offer once per open; unfollowing a follower resets the
 * run; "Not now" snoozes a week, finishing snoozes a day.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const RUN_WINDOW_MS = 10 * 60 * 1000;
export const NOT_NOW_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
export const DONE_SNOOZE_MS = 24 * 60 * 60 * 1000;
const SNOOZE_KEY = 'dehub_non_follower_offer_snoozed_until';

let run = 0;
let lastAt = 0;
let offeredThisOpen = false;
let snoozedUntil = 0;
let snoozeLoaded = false;
const listeners = new Set<() => void>();

AsyncStorage.getItem(SNOOZE_KEY)
  .then((v) => { snoozedUntil = Number(v) || 0; })
  .catch(() => {})
  .finally(() => { snoozeLoaded = true; });

export function subscribeNonFollowerOffer(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function snoozeNonFollowerOffer(ms: number) {
  snoozedUntil = Date.now() + ms;
  AsyncStorage.setItem(SNOOZE_KEY, String(snoozedUntil)).catch(() => {});
}

/** Called with the server's answer to every unfollow. `undefined` = an older server that does not say. */
export function noteUnfollow(followsYou: boolean | undefined, now = Date.now()) {
  if (followsYou === undefined) return;
  if (followsYou) { run = 0; return; }
  run = now - lastAt > RUN_WINDOW_MS ? 1 : run + 1;
  lastAt = now;
  if (run < 2 || offeredThisOpen || !snoozeLoaded || snoozedUntil > now) return;
  offeredThisOpen = true;
  run = 0;
  listeners.forEach((cb) => cb());
}

/** Tests only. */
export function resetNonFollowerStreak() {
  run = 0; lastAt = 0; offeredThisOpen = false; snoozedUntil = 0; snoozeLoaded = true;
}
