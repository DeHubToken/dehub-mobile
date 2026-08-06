import React from "react";
import { Image, type ImageProps, type ImageContentFit } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";

type SmartImageProps = {
  source: ImageProps["source"];
  contentFit?: ImageContentFit;
  /**
   * Defaults to "memory-disk". expo-image's own default is "disk", which
   * re-reads and re-decodes the file from disk on every scroll-back; for the
   * recycling lists this component feeds that is pure jank.
   */
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  transition?: number;
  /** Pass the item id in recycling lists so a reused view can't show the previous image. */
  recyclingKey?: string | null;
  priority?: "low" | "normal" | "high";
  placeholder?: ImageProps["placeholder"];
  /** Locked-post previews blur their thumbnail; expo-image does this on the GPU. */
  blurRadius?: number;
  style?: StyleProp<ImageStyle>;
  className?: string;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  /** Fires before onLoadEnd when the source fails, for callers that swap in a fallback. */
  onError?: () => void;
};

export const SmartImage: React.FC<SmartImageProps> = ({
  source,
  contentFit = "cover",
  cachePolicy = "memory-disk",
  transition,
  recyclingKey,
  priority,
  placeholder,
  blurRadius,
  style,
  className,
  onLoadStart,
  onLoadEnd,
  onError,
}) => {
  return (
    <Image
      source={source}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      recyclingKey={recyclingKey}
      priority={priority}
      placeholder={placeholder}
      blurRadius={blurRadius}
      style={style}
      className={className as any}
      onLoadStart={onLoadStart}
      onLoadEnd={onLoadEnd}
      onError={onError}
    />
  );
};

export default SmartImage;
