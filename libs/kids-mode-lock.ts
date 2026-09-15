/**
 * The Kids Mode device lock — mirrors web's `src/lib/kids-mode-lock.ts`.
 *
 * Two things have to be true for Kids Mode to work and they live in different
 * places. The account flag is the authority and the server reads it directly;
 * this is the local half, and it is what puts `X-Kids-Mode` on every request.
 *
 * It has to be readable SYNCHRONOUSLY, because `apiClient` builds its headers
 * without awaiting anything and the very first request of a cold start goes
 * out before any screen has mounted. AsyncStorage cannot answer synchronously,
 * so the value is mirrored in a module-level variable that `hydrateKidsMode()`
 * fills once at boot, and every write updates both.
 *
 * The consequence to know: between process start and hydration the mirror
 * reads `false`. That window is one storage read long and is covered by the
 * account flag for anybody signed in — which, on a device somebody deliberately
 * put into Kids Mode, is everybody.
 *
 * @module libs/kids-mode-lock
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@dhb_kids_mode';

/** Mirror of the stored value. The only thing `apiClient` can read in time. */
let cached = false;

/** Listeners for changes, so a mounted screen re-renders when the lock moves. */
const listeners = new Set<(locked: boolean) => void>();

/**
 * Load the lock into the synchronous mirror. Called once from the app's boot
 * path, before the first authenticated request if at all possible.
 */
export async function hydrateKidsMode(): Promise<boolean> {
  try {
    cached = (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
  } catch {
    // Storage unavailable. `cached` keeps whatever it had, which on a cold
    // start is `false` — the account flag still locks a signed-in session
    // server-side, so this degrades to a missing header, never to Kids Mode
    // silently turning off.
  }
  return cached;
}

/**
 * Kicked off at module evaluation, not from a screen.
 *
 * This module is pulled in by `api.client`, which every request goes through,
 * so the read starts as soon as the bundle touches the network layer at all —
 * earlier than any component could ask for it, and without every future caller
 * having to remember to.
 *
 * It is a promise, not a guarantee: `isKidsModeLocked()` reads `false` until it
 * settles. For a signed-in device — which is every device somebody deliberately
 * put into Kids Mode — the account flag covers that window server-side, and
 * `useKidsMode` re-renders from `onKidsModeChange` the moment it lands. Await
 * this where a caller genuinely cannot proceed without the answer.
 */
export const kidsModeReady: Promise<boolean> = hydrateKidsMode();

/** Whether this device is locked into Kids Mode. Safe to call from anywhere. */
export function isKidsModeLocked(): boolean {
  return cached;
}

/**
 * Arm or clear the local lock.
 *
 * Only ever called after the server has agreed — enabling writes this once
 * `POST /kids-mode/enable` succeeds, and clearing it waits for a successful
 * `disable`. Writing it optimistically would let a failed PIN check unlock the
 * device, which is the one thing this must never do.
 */
export async function setKidsModeLocked(locked: boolean): Promise<void> {
  cached = locked;
  listeners.forEach(fn => {
    try {
      fn(locked);
    } catch {
      /* a listener must never break the lock */
    }
  });
  try {
    if (locked) await AsyncStorage.setItem(STORAGE_KEY, '1');
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // The mirror above still holds for this process, and the account flag
    // holds across every other one.
  }
}

/** Subscribe to lock changes. Returns an unsubscribe. */
export function onKidsModeChange(fn: (locked: boolean) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
