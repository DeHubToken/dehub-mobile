/**
 * Over-the-air updates without waiting for a cold launch.
 *
 * expo-updates checks on launch and applies on the NEXT launch. A phone that
 * is never swiped away — the app just sits in the background between uses —
 * therefore never moves off the bundle it first started on. One tester ran a
 * bundle two days old across four feed fixes for exactly that reason, and
 * pull-to-refresh does nothing for it.
 *
 * So: every time the app comes to the foreground, check and download in the
 * background (rate-limited). If a download is sitting ready, apply it the next
 * time the app returns from a long enough background — the user has just come
 * back, nothing is mid-flight, and a reload there reads like a fresh open.
 */
import * as Updates from "expo-updates";

// Updates publish twice a day, so checking more often than this only costs
// requests to the update server.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// A reload interrupts whatever the user was doing, so only take it after an
// absence long enough that they are effectively re-opening the app.
export const APPLY_AFTER_BACKGROUND_MS = 60 * 1000;

let lastCheckAt = 0;
let updateReady = false;
let checking = false;

export function isUpdateReady(): boolean {
  return updateReady;
}

export async function checkForOtaUpdate(now = Date.now()): Promise<void> {
  if (__DEV__ || !Updates.isEnabled || checking) return;
  if (now - lastCheckAt < CHECK_INTERVAL_MS) return;
  lastCheckAt = now;
  checking = true;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    // The launch-time check may already have downloaded this update, in which
    // case fetchUpdateAsync reports isNew: false — but the bundle is on disk
    // either way, and the check said it is newer than what is running. Keying
    // "ready" on isNew left a downloaded update waiting for a cold launch that
    // never came, which is exactly the situation this file exists to fix.
    await Updates.fetchUpdateAsync();
    updateReady = true;
  } catch {
    // Offline, a captive portal, the update server down: try again next time.
  } finally {
    checking = false;
  }
}

/** Reload onto a downloaded update once the user has been away long enough. */
export async function applyOtaUpdateIfReady(backgroundMs: number): Promise<boolean> {
  if (!updateReady || backgroundMs < APPLY_AFTER_BACKGROUND_MS) return false;
  updateReady = false;
  try {
    await Updates.reloadAsync();
    return true;
  } catch {
    // Keep going on the current bundle; the next cold launch applies it.
    return false;
  }
}

export function __resetOtaStateForTests(): void {
  lastCheckAt = 0;
  updateReady = false;
  checking = false;
}
