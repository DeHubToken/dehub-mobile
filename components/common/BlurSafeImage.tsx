import React from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";
import { Image as RNImage, PixelRatio, Platform, View, type ImageResizeMode, type ImageSourcePropType } from "react-native";

/**
 * Blurred pictures that can't crash Android.
 *
 * expo-image blurs on Android with RenderScript (glide-transformations), and
 * RenderScript is gone on new Android builds: a Galaxy S24+ crashed natively
 * (null pointer in libRSDriver on Glide's thread) while scrolling a profile
 * with audio tiles. That crash can't be caught from Java or JS.
 *
 * On Android a blurred picture is drawn by React Native's own Image instead,
 * which blurs in plain code (Fresco's box blur). iOS and unblurred pictures
 * stay on expo-image.
 */

const FIT: Record<string, ImageResizeMode> = {
  cover: "cover",
  contain: "contain",
  fill: "stretch",
  none: "center",
  "scale-down": "contain",
};

/**
 * expo-image capped the radius at 25 and blurred a quarter-size copy, so its
 * blur reached about 4x the radius in real pixels. React Native takes dp.
 */
export function androidBlurRadius(radius: number): number {
  return Math.max(1, Math.round((Math.min(radius, 25) * 4) / PixelRatio.get()));
}

export function needsSafeBlur(blurRadius: number | null | undefined): boolean {
  return Platform.OS === "android" && !!blurRadius && blurRadius > 0;
}

function toRNSource(source: ImageProps["source"]): ImageSourcePropType | undefined {
  const first = Array.isArray(source) ? source[0] : source;
  if (first == null) return undefined;
  if (typeof first === "number") return first;
  if (typeof first === "string") return first ? { uri: first } : undefined;
  if (typeof first === "object" && "uri" in first && first.uri) {
    const { uri, headers } = first as { uri: string; headers?: Record<string, string> };
    return headers ? { uri, headers } : { uri };
  }
  return undefined;
}

type SafeBlurProps = Pick<ImageProps, "source" | "style" | "contentFit" | "blurRadius" | "accessible" | "accessibilityLabel" | "testID"> & {
  onError?: () => void;
  onLoadEnd?: () => void;
};

/** The Android path on its own, for components that already wrap expo-image. */
export function AndroidBlurredImage({ source, style, contentFit = "cover", blurRadius, accessible, accessibilityLabel, testID, onError, onLoadEnd }: SafeBlurProps) {
  const rnSource = toRNSource(source);
  // Never fall back to the unblurred picture: blur also hides locked media.
  if (!rnSource) return <View style={style as any} />;
  return (
    <RNImage
      source={rnSource}
      style={style as any}
      resizeMode={FIT[contentFit as string] ?? "cover"}
      blurRadius={androidBlurRadius(blurRadius ?? 0)}
      fadeDuration={0}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onError={onError}
      onLoadEnd={onLoadEnd}
    />
  );
}

/** Drop-in for expo-image's Image wherever it is given a blurRadius. */
export default function BlurSafeImage(props: ImageProps) {
  if (!needsSafeBlur(props.blurRadius)) return <ExpoImage {...props} />;
  const { onError, onLoadEnd } = props;
  return (
    <AndroidBlurredImage
      {...props}
      onError={onError ? () => onError({ error: "load failed" } as any) : undefined}
      onLoadEnd={onLoadEnd ? () => onLoadEnd() : undefined}
    />
  );
}
