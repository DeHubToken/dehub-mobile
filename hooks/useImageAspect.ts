import { useCallback, useRef, useState } from "react";
import type { ImageLoadEventData } from "expo-image";
import { FEED_IMAGE_FALLBACK_ASPECT } from "../libs/feed-image-layout";

const aspectRatioCache = new Map<string, number>();
const MAX_CACHE_ENTRIES = 1000;

function cacheAspectRatio(uri: string, ratio: number) {
  if (aspectRatioCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = aspectRatioCache.keys().next().value;
    if (oldest !== undefined) aspectRatioCache.delete(oldest);
  }
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
    cacheAspectRatio(uri, measured);
    // A recycled row may have moved on while the previous request completed.
    if (currentUri.current !== uri) return;
    setMeasurement((previous) => previous?.uri === uri && previous.ratio === measured
      ? previous
      : { uri, ratio: measured });
  }, [uri]);

  return { ratio, onLoad };
}
