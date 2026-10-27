import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, type ImageProps, type ImageContentFit } from "expo-image";
import type { ImageStyle, StyleProp } from "react-native";
import { cdnImageSource, probeTransformOrigin, useTransformReachable, withStorageImageHeaders } from "../../libs/cdnImage";

const TRANSFORM_PREFIX = "https://dehub.io/cdn-cgi/image/";
/** A resized copy still loading after this long is dropped for the original. */
const TRANSFORM_STALL_MS = 10_000;
const warmed = new Set<string>();
/** Warm one neighbour into the same native cache the visible image uses. */
export function warmFeedImage(uri: string): void {
  if (!uri || warmed.has(uri)) return;
  warmed.add(uri);
  if (warmed.size > 64) warmed.delete(warmed.values().next().value!);
  const source = withStorageImageHeaders({ uri });
  void Image.prefetch(uri, { cachePolicy: 'memory-disk', headers: (source as { headers?: Record<string, string> }).headers }).then(ok => {
    if (!ok) warmed.delete(uri);
  }).catch(() => warmed.delete(uri));
}

/**
 * A photo's shape (width / height) without drawing it: expo-image decodes it
 * small, through the same cache that paints it. Undefined if it can't load.
 */
export function measureImageAspect(uri: string): Promise<number | undefined> {
  if (typeof Image.loadAsync !== 'function') return Promise.resolve(undefined);
  return Image.loadAsync(uri, { maxWidth: 64, maxHeight: 64 })
    .then(ref => {
      const { width, height } = ref;
      ref.release();
      return width && height ? width / height : undefined;
    })
    .catch(() => undefined);
}

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
  const uri = typeof source === 'string' ? source : source && typeof source === 'object' && 'uri' in source ? source.uri : undefined;
  const [failedUri, setFailedUri] = useState<string>();
  const original = uri ? cdnImageSource(uri) : undefined;
  // A source built while dehub.io still looked reachable switches to the
  // original as soon as it is known not to be, rather than waiting out a timeout.
  const transformReachable = useTransformReachable();
  const viaTransform = !!uri && uri.startsWith(TRANSFORM_PREFIX);
  const useOriginal = !!uri && original !== uri && (failedUri === uri || (viaTransform && !transformReachable));
  const resolvedSource = useMemo(() => withStorageImageHeaders(useOriginal
    ? typeof source === 'object' ? { ...source, uri: original } : { uri: original }
    : source), [source, useOriginal, original]);
  const handleError = useCallback(() => {
    if (uri && original !== uri && !useOriginal) {
      // One bad file is a 404; a blocked dehub.io fails them all. Let the probe decide.
      if (viaTransform) void probeTransformOrigin();
      setFailedUri(uri);
      return;
    }
    onError?.();
  }, [uri, original, useOriginal, viaTransform, onError]);
  const animatedRef = useRef(false);
  const syncAnimation = useCallback(() => {
    if (!animatedRef.current || autoplay === undefined) return;
    const operation = autoplay ? imageRef.current?.startAnimating() : imageRef.current?.stopAnimating();
    operation?.catch(() => {});
  }, [autoplay]);
  // Android's autoplay prop controls newly loaded resources. An existing GIF
  // needs the native animation command when its row leaves the viewport.
  useEffect(syncAnimation, [syncAnimation]);
  // A resize that stalls never errors on its own: one photo's transform hung
  // for over a minute on a phone while the original loaded instantly.
  const stallRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!uri || !viaTransform || useOriginal || original === uri) return;
    stallRef.current = setTimeout(() => setFailedUri(uri), TRANSFORM_STALL_MS);
    return () => clearTimeout(stallRef.current);
  }, [uri, viaTransform, useOriginal, original]);
  const handleLoad = useCallback<NonNullable<ImageProps['onLoad']>>((event) => {
    clearTimeout(stallRef.current);
    animatedRef.current = event.source.isAnimated ?? false;
    syncAnimation();
    onLoad?.(event);
  }, [onLoad, syncAnimation]);
  return (
    <Image
      ref={imageRef}
      // A resized Supabase Storage URL only comes back as WebP when the request
      // says it accepts WebP, which the native loaders do not say on their own.
      source={resolvedSource}
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
      onError={handleError}
    />
  );
};

export default SmartImage;
