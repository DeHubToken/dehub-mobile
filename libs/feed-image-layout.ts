export const FEED_IMAGE_MAX_HEIGHT = 600;
export const FEED_IMAGE_FALLBACK_ASPECT = 4 / 3;

export interface FeedImageDimensions {
  width: number;
  height: number;
}

/**
 * Fits an image inside the feed column without cropping it.
 *
 * Images use the full column width until doing so would exceed the height cap.
 * Taller images keep their natural aspect ratio and become narrower instead.
 */
export function fitFeedImageWithin(
  containerWidth: number,
  aspectRatio: number,
  maxHeight = FEED_IMAGE_MAX_HEIGHT,
): FeedImageDimensions {
  const width = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0;
  const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0
    ? aspectRatio
    : FEED_IMAGE_FALLBACK_ASPECT;
  const heightCap = Number.isFinite(maxHeight) && maxHeight > 0
    ? maxHeight
    : FEED_IMAGE_MAX_HEIGHT;
  const fullWidthHeight = width / ratio;

  if (fullWidthHeight <= heightCap) {
    return { width, height: fullWidthHeight };
  }

  return {
    width: heightCap * ratio,
    height: heightCap,
  };
}
