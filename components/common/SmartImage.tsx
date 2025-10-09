import React from "react";
import { Image as RNImage, ImageProps as RNImageProps, ImageStyle, StyleProp } from "react-native";

type SmartImageProps = {
  source: RNImageProps["source"];
  contentFit?: "cover" | "contain" | "fill" | "none" | "scale-down";
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  transition?: number;
  style?: StyleProp<ImageStyle>;
  className?: string;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
};

export const SmartImage: React.FC<SmartImageProps> = ({
  source,
  contentFit = "cover",
  cachePolicy,
  transition,
  style,
  className,
  onLoadStart,
  onLoadEnd,
}) => {
  let ExpoImageComp: any = null;
  try {
    // Dynamically require expo-image if installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ExpoImageComp = require("expo-image").Image;
  } catch {
    ExpoImageComp = null;
  }

  if (ExpoImageComp) {
    return (
      <ExpoImageComp
        source={source as any}
        contentFit={contentFit}
        cachePolicy={cachePolicy}
        transition={transition}
        style={style}
        className={className as any}
        onLoadStart={onLoadStart}
        onLoadEnd={onLoadEnd}
      />
    );
  }

  // Fallback to RN Image
  const resizeMode = contentFit === "contain" ? "contain" : contentFit === "fill" ? "stretch" : "cover";
  return (
    <RNImage
      source={source}
      resizeMode={resizeMode as any}
      style={style as any}
      className={className}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
    />
  );
};

export default SmartImage;
