/**
 * useMediaAspect
 * ==============
 * Reports the real width/height ratio of a post's media, so a feed card can
 * size itself to the clip instead of forcing every video into a 16:9 box.
 *
 * The ratio is measured off the thumbnail: video thumbnails are extracted from
 * the clip, so they carry its shape, and the measurement resolves before the
 * player is ever mounted — the card lands on the right height as it scrolls
 * into view rather than snapping once playback starts.
 *
 * Results are cached per URL so one thumbnail is measured once across every
 * card and every screen, and the cached value is returned synchronously on the
 * first render of a recycled cell.
 */
import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";

const cache = new Map<string, number>();

/** Enough pixels to read a ratio to a fraction of a percent, few enough to decode for free. */
const MEASURE_MAX_PX = 512;

/**
 * Ratios outside this band are clamped. The lower bound is full-height 9:16 —
 * a vertical clip fills the card as shot. The upper bound leaves room for
 * cinematic 2.39:1 without letting a stray measurement flatten a card to a
 * sliver.
 */
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 2.4;

/**
 * Floor for the post page, which shows a clip at its real shape however thin
 * it is. Still bounded so a bad measurement can't collapse the player to a line.
 */
export const THIN_MIN_RATIO = 1 / 5;

/** Every video falls back to this until something better is known. */
export const DEFAULT_ASPECT = 16 / 9;

export function clampAspect(ratio: number, minRatio: number = MIN_RATIO): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT;
  return Math.min(MAX_RATIO, Math.max(minRatio, ratio));
}

/**
 * @param uri thumbnail to measure — pass undefined to keep the default frame
 * @param key the post the thumbnail belongs to
 * @param minRatio narrowest shape allowed; defaults to 9:16
 * @returns a clamped width/height ratio, never null: 16:9 until measured
 */
export function useMediaAspect(uri?: string | null, key?: unknown, minRatio: number = MIN_RATIO): number {
  // A measurement carries the URL it was taken from, and is read straight from
  // the cache otherwise. A card handed another clip is the right size in its
  // first render, not after an effect has caught up, and a late measurement
  // of the previous clip never resizes it.
  const [measured, setMeasured] = useState<{ uri: string; ratio: number } | null>(null);
  // The last shape shown and the post it was for. The same post can get a new
  // thumbnail URL: a window resize that crosses a width step, a replaced
  // cover, the high-quality images toggle. It keeps its shape until the new
  // URL is measured instead of dropping to 16:9 and back. Another post never
  // inherits it.
  const shown = useRef<{ key: unknown; ratio: number } | null>(null);
  let ratio = uri ? (measured?.uri === uri ? measured.ratio : cache.get(uri) ?? null) : null;
  if (ratio === null && uri && shown.current !== null && Object.is(shown.current.key, key)) {
    ratio = shown.current.ratio;
  }
  shown.current = ratio === null ? null : { key, ratio };

  useEffect(() => {
    if (!uri || cache.has(uri)) return;

    let cancelled = false;
    // Measured through expo-image, the same pipeline and cache that paints the
    // poster, capped small. RN's Image.getSize downloaded the file again
    // through Fresco and decoded it at full size into a second memory cache,
    // once per video card. The cap keeps the aspect ratio, which is all this
    // needs.
    Image.loadAsync(uri, { maxWidth: MEASURE_MAX_PX, maxHeight: MEASURE_MAX_PX })
      .then((ref) => {
        const { width: w, height: h } = ref;
        ref.release();
        if (!w || !h) return;
        // Cached even when this card has moved on: the next card to show this
        // clip gets it for free.
        const r = w / h;
        cache.set(uri, r);
        if (!cancelled) setMeasured({ uri, ratio: r });
      })
      // Unmeasurable thumbnail (offline, 404) just leaves the default frame.
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return ratio ? clampAspect(ratio, minRatio) : DEFAULT_ASPECT;
}
