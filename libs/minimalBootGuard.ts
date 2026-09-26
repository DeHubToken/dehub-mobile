import { storage } from "./storage";

/**
 * Keeps a bad minimal-theme launch from becoming a bad every-launch.
 *
 * The theme is saved, so anything that stops the app coming up in minimal
 * repeats on every launch, and the only way back to System is a Settings
 * screen the user cannot reach. Each launch that starts in minimal leaves a
 * note here; the preloader lifting clears it (libs/bootReveal.ts). A note
 * still standing at the next launch means the last minimal launch never
 * showed the app, so this one starts in System and saves that.
 */
const PENDING_KEY = "minimal-boot-pending-v1";

/** True when this launch may start in minimal; false after a minimal launch that never came up. */
export function claimMinimalLaunch(): boolean {
  try {
    if (storage.getBoolean(PENDING_KEY)) {
      storage.delete(PENDING_KEY);
      return false;
    }
    storage.set(PENDING_KEY, true);
  } catch {
    /* MMKV unavailable: no guard, but never block the theme on it */
  }
  return true;
}

/** The app is on screen: this launch came up fine. */
export function settleMinimalLaunch(): void {
  try {
    storage.delete(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}
