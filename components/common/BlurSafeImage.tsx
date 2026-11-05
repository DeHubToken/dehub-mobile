import React, { useCallback, useState } from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";
import { Platform, View, type LayoutChangeEvent } from "react-native";

/**
 * Blurred pictures that can't crash Android.
 *
 * expo-image blurs on Android with RenderScript (glide-transformations), and
 * RenderScript is gone on new Android builds: a Galaxy S24+ crashed natively
 * (null pointer in libRSDriver on Glide's thread) while scrolling a profile
 * with audio tiles. That crash can't be caught from Java or JS.
 *
 * On Android the picture is instead drawn a few dozen pixels wide and scaled
 * up on the GPU, which softens it like a blur. It stays on expo-image, so it
 * comes straight from the cache the feed already filled: a first try that
 * re-fetched through React Native's Image left the Shorts backdrop empty for
 * the first frames of every open. iOS and unblurred pictures are unchanged.
 */

/** Width in dp of the small copy: a stronger blur draws it smaller. */
export function blurSampleWidth(boxWidth: number, radius: number): number {
  return Math.max(8, Math.min(64, Math.round((boxWidth * 1.2) / Math.max(4, Math.min(radius, 40)))));
}

export function needsSafeBlur(blurRadius: number | null | undefined): boolean {
  return Platform.OS === "android" && !!blurRadius && blurRadius > 0;
}

type SafeBlurProps = Pick<ImageProps, "source" | "style" | "contentFit" | "blurRadius" | "accessible" | "accessibilityLabel" | "testID" | "cachePolicy"> & {
  onError?: () => void;
  onLoadEnd?: () => void;
};

/** The Android path on its own, for components that already wrap expo-image. */
export function AndroidBlurredImage({ source, style, contentFit = "cover", blurRadius, accessible, accessibilityLabel, testID, cachePolicy, onError, onLoadEnd }: SafeBlurProps) {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);
  // Never fall back to the full picture: blur also hides locked media.
  const sample = box && box.w > 0 && box.h > 0 ? blurSampleWidth(box.w, blurRadius ?? 0) : 0;
  const sampleH = sample && box ? (sample * box.h) / box.w : 0;
  return (
    <View
      style={[style as any, { overflow: "hidden" }]}
      onLayout={onLayout}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      pointerEvents="none"
    >
      {sample > 0 && box ? (
        <ExpoImage
          source={source}
          contentFit={contentFit}
          cachePolicy={cachePolicy}
          transition={0}
          onError={onError ? () => onError() : undefined}
          onLoadEnd={onLoadEnd}
          style={{
            position: "absolute",
            width: sample,
            height: sampleH,
            left: (box.w - sample) / 2,
            top: (box.h - sampleH) / 2,
            transform: [{ scale: box.w / sample }],
          }}
        />
      ) : null}
    </View>
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
