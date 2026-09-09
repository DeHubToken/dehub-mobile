import { useEffect, useState } from "react";
import { Image } from "react-native";
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

/** Returns an image's natural width/height ratio, cached for recycled feed rows. */
export function useImageAspect(uri: string): number {
  const [ratio, setRatio] = useState<number>(() =>
    aspectRatioCache.get(uri) ?? FEED_IMAGE_FALLBACK_ASPECT,
  );

  useEffect(() => {
    const cached = aspectRatioCache.get(uri);
    if (cached !== undefined) {
      setRatio(cached);
      return;
    }

    setRatio(FEED_IMAGE_FALLBACK_ASPECT);
    let cancelled = false;
    Image.getSize(
      uri,
      (width, height) => {
        if (cancelled || width <= 0 || height <= 0) return;
        const measured = width / height;
        cacheAspectRatio(uri, measured);
        setRatio(measured);
      },
      () => {},
    );

    return () => {
      cancelled = true;
    };
  }, [uri]);

  return ratio;
}
