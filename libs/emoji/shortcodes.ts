/**
 * `:shortcode:` → emoji, for every name Slack, GitHub, Discord and JoyPixels
 * use (built by dehubweb's scripts/build-emoji-data.mjs; never edit data/ by
 * hand). Parsed the first time a message actually contains a candidate
 * `:code:`, not at boot — the require sits inside the call.
 */

let map: Record<string, string> | null = null;

export function getLoadedShortcodes(): Record<string, string> | null {
  return map;
}

export function getShortcodes(): Record<string, string> {
  if (!map) map = require("./data/shortcodes.json") as Record<string, string>;
  return map;
}

/** Promise form so callers read the same as dehubweb's lazy chunk. */
export function loadShortcodes(): Promise<Record<string, string>> {
  try {
    return Promise.resolve(getShortcodes());
  } catch (err) {
    return Promise.reject(err);
  }
}
