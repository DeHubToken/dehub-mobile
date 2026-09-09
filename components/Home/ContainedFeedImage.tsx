import React, { memo, useCallback, useMemo, useState } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { fitFeedImageWithin } from "../../libs/feed-image-layout";
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
  const aspectRatio = useImageAspect(uri);
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
      <SmartImage
        source={{ uri }}
        contentFit="contain"
        className="rounded-xl"
        style={{ width: dimensions.width, height: dimensions.height }}
        recyclingKey={uri}
        priority={priority}
      />
    </View>
  );
};

export default memo(ContainedFeedImage);
