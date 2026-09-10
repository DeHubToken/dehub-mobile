import {
  FEED_IMAGE_FALLBACK_ASPECT,
  FEED_IMAGE_MAX_HEIGHT,
  FEED_BENTO_RADIUS,
  fitFeedImageWithin,
} from "../../libs/feed-image-layout";

describe("feed image layout", () => {
  it("uses the native bento radius for feed media", () => {
    expect(FEED_BENTO_RADIUS).toBe(12);
  });

  it("uses the full feed width when the natural height fits", () => {
    expect(fitFeedImageWithin(360, 16 / 9)).toEqual({ width: 360, height: 202.5 });
    expect(fitFeedImageWithin(360, 1)).toEqual({ width: 360, height: 360 });
  });

  it("caps tall images without cropping their natural ratio", () => {
    expect(fitFeedImageWithin(360, 9 / 16)).toEqual({
      width: FEED_IMAGE_MAX_HEIGHT * (9 / 16),
      height: FEED_IMAGE_MAX_HEIGHT,
    });
    expect(fitFeedImageWithin(360, 1 / 3)).toEqual({
      width: FEED_IMAGE_MAX_HEIGHT / 3,
      height: FEED_IMAGE_MAX_HEIGHT,
    });
  });

  it("falls back safely when metadata is invalid", () => {
    expect(fitFeedImageWithin(360, Number.NaN)).toEqual({
      width: 360,
      height: 360 / FEED_IMAGE_FALLBACK_ASPECT,
    });
  });
});
