import React, { memo, useCallback, useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { FEED_BENTO_RADIUS, fitFeedImageWithin } from "../../libs/feed-image-layout";
import { useImageAspect } from "../../hooks/useImageAspect";
import SmartImage from "../common/SmartImage";

interface ContainedFeedImageProps {
  uri: string;
  /** Fixed carousel page width. Omit for a single image that fills its parent. */
  width?: number;
  fallbackWidth: number;
  priority?: "low" | "normal" | "high";
}

/** Natural-ratio feed image with the same 600-unit height cap as the web app. */
const ContainedFeedImage: React.FC<ContainedFeedImageProps> = ({
  uri,
  width,
  fallbackWidth,
  priority,
}) => {
  const { ratio: aspectRatio, onLoad } = useImageAspect(uri);
  const [measuredWidth, setMeasuredWidth] = useState(fallbackWidth);
  const availableWidth = width ?? measuredWidth;
  const dimensions = useMemo(
    () => fitFeedImageWithin(availableWidth, aspectRatio),
    [availableWidth, aspectRatio],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    if (width !== undefined) return;
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0) setMeasuredWidth(nextWidth);
  }, [width]);

  return (
    <View
      onLayout={handleLayout}
      style={{
        width: width ?? "100%",
        height: dimensions.height,
        alignItems: "flex-start",
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
          borderRadius: FEED_BENTO_RADIUS,
          overflow: "hidden",
        }}
      >
        <SmartImage
          source={{ uri }}
          contentFit="contain"
          cachePolicy="disk"
          style={{ width: "100%", height: "100%" }}
          recyclingKey={uri}
          priority={priority}
          onLoad={onLoad}
        />
      </View>
    </View>
  );
};

export default memo(ContainedFeedImage);
