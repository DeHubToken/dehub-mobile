/**
 * The icon fonts. On Android <Icon> draws plain icons as one glyph of a font:
 * a single Text drawn from the GPU glyph atlas. react-native-svg rasterises
 * every SvgView into its own software bitmap on the UI thread and uploads it
 * as a fresh texture each time it mounts, which made a feed card's ten icons
 * the largest part of its first draw.
 *
 * Two fonts: lucide's own, and CutIcons, built from Riftn's cut artwork
 * (components/ui/cut-icons.tsx, scripts/build-cut-icon-font.py). Most icons on
 * a feed card are cut icons, so without the second font they stayed SVG.
 *
 * Until a font has registered, or if it never does, its icons stay on SVG.
 */

export const ICON_FONT_FAMILY = "LucideIcons";
export const CUT_ICON_FONT_FAMILY = "CutIcons";

/** false sends every icon back to SVG. */
const ENABLED = true;
/** false sends only the cut icons back to SVG. */
const CUT_ENABLED = true;

let ready = false;
let cutReady = false;
let pending: Promise<void> | null = null;

export function isIconFontReady(): boolean {
  return ready;
}

export function isCutIconFontReady(): boolean {
  return cutReady;
}

/** Never rejects: a failed load leaves that font's icons on SVG. */
export function loadIconFont(): Promise<void> {
  if (!ENABLED) return Promise.resolve();
  if (!pending) {
    // Required here, not imported: <Icon> reads this module everywhere, and
    // only the boot path needs expo-font.
    const { loadAsync } = require("expo-font") as typeof import("expo-font");
    const load = (family: string, asset: number, done: () => void) =>
      loadAsync(family, asset).then(done, (error) => {
        if (__DEV__) console.warn(`[iconFont] ${family} failed to load; its icons stay on SVG`, error);
      });
    pending = Promise.all([
      load(ICON_FONT_FAMILY, require("../assets/fonts/lucide.ttf"), () => {
        ready = true;
      }),
      CUT_ENABLED
        ? load(CUT_ICON_FONT_FAMILY, require("../assets/fonts/cut-icons.ttf"), () => {
            cutReady = true;
          })
        : Promise.resolve(),
    ]).then(() => undefined);
  }
  return pending;
}
