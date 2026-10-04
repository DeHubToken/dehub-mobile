import React, { memo, useCallback, useMemo, useState } from "react";
import { View, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { FEED_BENTO_RADIUS, fitFeedImageWithin } from "../../libs/feed-image-layout";
import { useImageAspect } from "../../hooks/useImageAspect";
import SmartImage from "../common/SmartImage";
import { useAppTheme } from "../../context/ThemeContext";
import { useSettledAutoplay } from "../../hooks/useSettledAutoplay";
import { useFeedBleed } from "./feedBleed";

interface ContainedFeedImageProps {
  uri: string;
  /** Fixed carousel page width. Omit for a single image that fills its parent. */
  width?: number;
  /** Hug the rendered bitmap width instead of reserving the full feed column. */
  compact?: boolean;
  fallbackWidth: number;
  priority?: "low" | "normal" | "high";
  active?: boolean;
  drawBitmap?: boolean;
  /** Post page: square corners, centred, and as tall as the post page video
   *  may be: 80% of the screen, or a full-width 9:16 frame if that is taller. */
  postPage?: boolean;
}

/**
 * Tallest a photo gets on the post page. Same rule as the post page video
 * (FeedVideoPlayer, postPageMaxHeightFor): most of the screen, and never less
 * than a full-width 9:16 frame, so a tall photo spans the whole width instead
 * of stopping short of both edges.
 */
const postPageMaxHeightFor = (screenHeight: number, boxWidth: number) =>
  Math.round(Math.max(screenHeight * 0.8, (boxWidth * 16) / 9));

/** Natural-ratio feed image with the same 600-unit height cap as the web app. */
const ContainedFeedImage: React.FC<ContainedFeedImageProps> = ({
  uri,
  width,
  compact = false,
  fallbackWidth,
  priority,
  active = true,
  drawBitmap = true,
  postPage = false,
}) => {
  const { height: screenHeight } = useWindowDimensions();
  const animate = useSettledAutoplay(active, uri, 400);
  const source = useMemo(() => ({ uri }), [uri]);
  const { ratio: aspectRatio, onLoad } = useImageAspect(uri);
  const { isMinimal } = useAppTheme();
  // Minimal and the cinematic system feed both run the image edge to edge.
  const bleed = !!useFeedBleed();
  const edgeToEdge = isMinimal || bleed;
  const [measuredWidth, setMeasuredWidth] = useState(fallbackWidth);
  const availableWidth = width ?? measuredWidth;
  const dimensions = useMemo(
    () => bleed
      // Cinematic feed: always the full width, as tall as the photo up to
      // the post page cap (the same cap as its videos), and a photo taller
      // than that is cropped to the box rather than letterboxed.
      ? {
          width: availableWidth,
          height: Math.min(
            availableWidth / (aspectRatio > 0 ? aspectRatio : 1),
            postPageMaxHeightFor(screenHeight, availableWidth),
          ),
        }
      : fitFeedImageWithin(
          availableWidth,
          aspectRatio,
          postPage ? postPageMaxHeightFor(screenHeight, availableWidth) : undefined,
        ),
    [availableWidth, aspectRatio, postPage, screenHeight, bleed],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (width !== undefined) return;
    const nextWidth = event.nativeEvent.layout.width;
    // A pixel or two of difference from the guess is not worth a second
    // layout and an image re-decode; the clip hides the overhang.
    if (nextWidth > 0) setMeasuredWidth((prev) => (Math.abs(prev - nextWidth) < 3 ? prev : nextWidth));
  }, [width]);

  return (
    <View
      onLayout={handleLayout}
      style={{
        width: compact ? dimensions.width : (width ?? "100%"),
        height: dimensions.height,
        // Minimal runs the column edge to edge, so a portrait image that stops
        // short of the width sits centred rather than hugging one side.
        alignItems: (edgeToEdge || postPage) && !compact ? "center" : "flex-start",
      }}
    >
      {/* Android does not consistently clip expo-image's native surface when
          the radius lives on the image itself. The ordinary system-theme feed
          made that visible as square photo corners inside a rounded bento.
          Clip in a plain View using the exact radius the card uses instead. */}
      <View
        style={{
          width: dimensions.width,
          height: dimensions.height,
          borderRadius: edgeToEdge || postPage ? 0 : FEED_BENTO_RADIUS,
          overflow: "hidden",
        }}
      >
        {drawBitmap && <SmartImage
          source={source}
          contentFit={bleed ? "cover" : "contain"}
          cachePolicy="memory-disk"
          style={{ width: "100%", height: "100%" }}
          recyclingKey={uri}
          priority={priority}
          autoplay={animate}
          onLoad={onLoad}
        />}
      </View>
    </View>
  );
};

export default memo(ContainedFeedImage);
