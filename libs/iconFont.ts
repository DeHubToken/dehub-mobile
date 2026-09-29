/**
 * Lucide's icon font. On Android <Icon> draws plain icons as one glyph of it:
 * a single Text drawn from the GPU glyph atlas. react-native-svg rasterises
 * every SvgView into its own software bitmap on the UI thread and uploads it
 * as a fresh texture each time it mounts, which made a feed card's ten icons
 * the largest part of its first draw.
 *
 * Until the font has registered, or if it never does, every icon stays on SVG.
 */

export const ICON_FONT_FAMILY = "LucideIcons";

/** false sends every icon back to SVG. */
const ENABLED = true;

let ready = false;
let pending: Promise<void> | null = null;

export function isIconFontReady(): boolean {
  return ready;
}

/** Never rejects: a failed load leaves icons on SVG. */
export function loadIconFont(): Promise<void> {
  if (!ENABLED) return Promise.resolve();
  if (!pending) {
    // Required here, not imported: <Icon> reads this module everywhere, and
    // only the boot path needs expo-font.
    const { loadAsync } = require("expo-font") as typeof import("expo-font");
    pending = loadAsync(ICON_FONT_FAMILY, require("../assets/fonts/lucide.ttf")).then(
      () => {
        ready = true;
      },
      (error) => {
        if (__DEV__) console.warn("[iconFont] load failed; icons stay on SVG", error);
      },
    );
  }
  return pending;
}
