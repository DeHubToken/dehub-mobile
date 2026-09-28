import React, { useCallback, useEffect, useRef } from "react";
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
  /** Recolours every opaque pixel, like RN Image's tintColor — for monochrome icons. */
  tintColor?: string | null;
  /**
   * Defaults to true: decode at the rendered size, not the file's size. Only
   * turn off for a surface that genuinely needs every source pixel.
   */
  allowDownscaling?: boolean;
  /** Animated GIF/WebP play by default; pass false for a still first frame. */
  autoplay?: boolean;
  accessible?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ImageStyle>;
  /**
   * Ignored at runtime: NativeWind has no interop registered for expo-image,
   * so a className never reaches it. Size and position with `style`.
   */
  className?: string;
  onLoadStart?: () => void;
  onLoad?: ImageProps["onLoad"];
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
  tintColor,
  allowDownscaling,
  autoplay,
  accessible,
  accessibilityLabel,
  testID,
  style,
  className,
  onLoadStart,
  onLoad,
  onLoadEnd,
  onError,
}) => {
  const imageRef = useRef<Image>(null);
  const animatedRef = useRef(false);
  const syncAnimation = useCallback(() => {
    if (!animatedRef.current || autoplay === undefined) return;
    const operation = autoplay ? imageRef.current?.startAnimating() : imageRef.current?.stopAnimating();
    operation?.catch(() => {});
  }, [autoplay]);
  // Android's autoplay prop controls newly loaded resources. An existing GIF
  // needs the native animation command when its row leaves the viewport.
  useEffect(syncAnimation, [syncAnimation]);
  const handleLoad = useCallback<NonNullable<ImageProps['onLoad']>>((event) => {
    animatedRef.current = event.source.isAnimated ?? false;
    syncAnimation();
    onLoad?.(event);
  }, [onLoad, syncAnimation]);
  return (
    <Image
      ref={imageRef}
      source={source}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      transition={transition}
      recyclingKey={recyclingKey}
      priority={priority}
      placeholder={placeholder}
      blurRadius={blurRadius}
      tintColor={tintColor}
      allowDownscaling={allowDownscaling}
      autoplay={autoplay}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={style}
      className={className as any}
      onLoadStart={onLoadStart}
      onLoad={handleLoad}
      onLoadEnd={onLoadEnd}
      onError={onError}
    />
  );
};

export default SmartImage;
