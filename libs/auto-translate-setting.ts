/**
 * Auto-translate preference
 * =========================
 * Whether the app may translate a post without being asked.
 *
 * Mirrors web's `src/lib/auto-translate-setting.ts`, including the key name and
 * the "on unless explicitly turned off" default, so the two clients behave the
 * same way for the same reader.
 *
 * MMKV rather than AsyncStorage because this is read synchronously during
 * render, inside an effect that must decide before the card paints. An async
 * read would mean either a first frame that never auto-translates or a state
 * round-trip per card in the feed.
 *
 * @module libs/auto-translate-setting
 */

import { storage } from './storage';

const AUTO_TRANSLATE_KEY = 'dehub-auto-translate';

/**
 * Read at call time rather than cached in a module constant, so a change
 * applies to the next card without an app restart.
 */
export function autoTranslateEnabled(): boolean {
  try {
    return storage.getString(AUTO_TRANSLATE_KEY) !== 'off';
  } catch {
    // Storage unavailable — fall back to the default rather than silently
    // switching the feature off for the session.
    return true;
  }
}

export function setAutoTranslateEnabled(enabled: boolean): void {
  try {
    storage.set(AUTO_TRANSLATE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage disabled; the setting just will not persist.
  }
}
