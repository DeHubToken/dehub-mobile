import { useCallback, useRef, useState } from "react";
import type { ImageLoadEventData } from "expo-image";
import { FEED_IMAGE_FALLBACK_ASPECT } from "../libs/feed-image-layout";
import { storage } from '../libs/storage';
import { createMediaAspectCache } from '../libs/media-aspect-cache';

const aspectRatioCache = createMediaAspectCache(
  () => storage.getString('media-aspects-v1'), value => storage.set('media-aspects-v1', value),
);

/**
 * expo-image reports the size of the bitmap it decoded, and it decodes at the
 * view's size. A 1600x958 photo in a 962px box comes back 962x576 one time and
 * 961x576 the next, so a re-measure moved the box by a pixel, the resize made
 * expo-image decode again at the new size, and that decode reported the other
 * rounding: the card flipped between two heights about 30 times a second,
 * reloading its image and redrawing the screen even at rest. A new reading
 * within this of the one already held is that rounding, not a new image.
 */
const RATIO_TOLERANCE = 0.01;

function cacheAspectRatio(uri: string, ratio: number) {
  aspectRatioCache.set(uri, ratio);
}

/** Reuse expo-image's load result instead of fetching each image again through Fresco. */
export function useImageAspect(uri: string) {
  const currentUri = useRef(uri);
  currentUri.current = uri;
  const [measurement, setMeasurement] = useState<{ uri: string; ratio: number }>();
  const ratio = measurement?.uri === uri
    ? measurement.ratio
    : aspectRatioCache.get(uri) ?? FEED_IMAGE_FALLBACK_ASPECT;

  const onLoad = useCallback((event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const measured = width / height;
    const known = aspectRatioCache.get(uri);
    if (known !== undefined && Math.abs(measured - known) <= known * RATIO_TOLERANCE) {
      if (currentUri.current === uri) {
        setMeasurement((previous) => (previous?.uri === uri ? previous : { uri, ratio: known }));
      }
      return;
    }
    cacheAspectRatio(uri, measured);
    // A recycled row may have moved on while the previous request completed.
    if (currentUri.current !== uri) return;
    setMeasurement((previous) => previous?.uri === uri && previous.ratio === measured
      ? previous
      : { uri, ratio: measured });
  }, [uri]);

  return { ratio, onLoad };
}
