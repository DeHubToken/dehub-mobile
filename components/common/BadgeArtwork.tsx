import React, { memo, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { Image as MotionImage, type ImageContentFit } from "expo-image";
import { useReducedMotion } from "react-native-reanimated";
import { badgeHoverArt } from "../../libs/badgeHoverArt";
import { openBadgeShowcase, tierForBadgeImage } from "../../libs/badgeShowcase";

interface Props {
  source: number;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  resizeMode?: "contain";
  fadeDuration?: number;
  cachePolicy?: "memory-disk";
}

function PlayingBadge({ poster, animation, imageStyle, motionStyle, onError }: { poster: number; animation: number; imageStyle: ImageStyle; motionStyle: ImageStyle; onError: () => void }) {
  const [ready, setReady] = useState(false);
  return <>
    <Image source={poster} resizeMode="contain" fadeDuration={0}
      style={[imageStyle, { opacity: ready ? 0 : 1 }]} testID="holder-badge-poster" />
    <MotionImage source={animation} contentFit="contain" autoplay useAppleWebpCodec={false}
      transition={0} cachePolicy="memory-disk" onDisplay={() => setReady(true)} onError={onError}
      style={[motionStyle, { opacity: ready ? 1 : 0 }]}
      testID="holder-badge-motion" />
  </>;
}

/** Idle badges share a still bitmap; only the badge being touched or hovered plays. */
function BadgeArtwork({ source, style }: Props) {
  const anchor = useRef<View>(null);
  const tier = tierForBadgeImage(source);
  const art = badgeHoverArt(tier);
  const reducedMotion = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [failedAnimation, setFailedAnimation] = useState<number | null>(null);
  const active = hovered || pressed || focused;
  const playing = active && !reducedMotion && !!art && failedAnimation !== art.animation;
  const poster = tier === "Killer Whale" ? source : art?.poster ?? source;
  const flat = StyleSheet.flatten(style) ?? {};
  const gutter = typeof flat.padding === "number" ? flat.padding : 0;
  const canvas = typeof flat.height === "number" ? flat.height - gutter * 2 : undefined;
  // Percentage-sized native images and absoluteFill disagree about padding.
  // Give both layers the same explicit canvas, including at compact sizes.
  const imageStyle: ImageStyle = canvas === undefined ? styles.image : {
    position: "absolute", width: canvas, height: canvas, left: gutter, top: gutter,
  };
  const stillBounds = tier === "Killer Whale"
    ? { left: 19, top: 17, right: 109, bottom: 121 }
    : art?.posterBounds;
  let motionStyle = imageStyle;
  if (canvas !== undefined && stillBounds && art?.bounds) {
    const motion = art.bounds;
    const motionCanvas = canvas * (stillBounds.bottom - stillBounds.top) / (motion.bottom - motion.top);
    motionStyle = {
      position: "absolute", width: motionCanvas, height: motionCanvas,
      left: gutter + canvas * (stillBounds.left + stillBounds.right) / 256 - motionCanvas * (motion.left + motion.right) / 256,
      top: gutter + canvas * stillBounds.bottom / 128 - motionCanvas * motion.bottom / 128,
    };
  }

  return (
    <Pressable
      ref={anchor}
      style={style as StyleProp<ViewStyle>}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={tier ?? undefined}
      testID="holder-badge"
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onPress={(event) => {
        event.stopPropagation();
        openBadgeShowcase(tier, anchor.current);
      }}
    >
      {playing && art ? (
        <PlayingBadge
          key={art.animation}
          poster={poster}
          animation={art.animation}
          imageStyle={imageStyle}
          motionStyle={motionStyle}
          onError={() => setFailedAnimation(art.animation)}
        />
      ) : (
        <Image source={poster} resizeMode="contain" fadeDuration={0} style={imageStyle} testID="holder-badge-poster" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({ image: { width: "100%", height: "100%" } });

export default memo(BadgeArtwork);
