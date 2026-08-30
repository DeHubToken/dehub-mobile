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
import { useEffect, useState } from "react";
import { Image } from "react-native";

const cache = new Map<string, number>();

/**
 * Ratios outside this band are clamped. The lower bound is full-height 9:16 —
 * a vertical clip fills the card as shot. The upper bound leaves room for
 * cinematic 2.39:1 without letting a stray measurement flatten a card to a
 * sliver.
 */
const MIN_RATIO = 9 / 16;
const MAX_RATIO = 2.4;

/** Every video falls back to this until something better is known. */
export const DEFAULT_ASPECT = 16 / 9;

export function clampAspect(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return DEFAULT_ASPECT;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

/**
 * @param uri thumbnail to measure — pass undefined to keep the default frame
 * @returns a clamped width/height ratio, never null: 16:9 until measured
 */
export function useMediaAspect(uri?: string | null): number {
  const [ratio, setRatio] = useState<number | null>(() =>
    uri ? cache.get(uri) ?? null : null,
  );

  useEffect(() => {
    if (!uri) {
      setRatio(null);
      return;
    }
    const cached = cache.get(uri);
    if (cached !== undefined) {
      setRatio(cached);
      return;
    }

    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (cancelled || !w || !h) return;
        const measured = w / h;
        cache.set(uri, measured);
        setRatio(measured);
      },
      // Unmeasurable thumbnail (offline, 404) just leaves the default frame.
      () => {},
    );

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return ratio ? clampAspect(ratio) : DEFAULT_ASPECT;
}
