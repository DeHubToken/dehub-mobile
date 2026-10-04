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
        <MotionImage
          key={art.animation}
          source={art.animation}
          contentFit="contain"
          autoplay
          useAppleWebpCodec={false}
          transition={0}
          cachePolicy="memory-disk"
          onError={() => setFailedAnimation(art.animation)}
          style={styles.image}
          testID="holder-badge-motion"
        />
      ) : (
        <Image source={poster} resizeMode="contain" fadeDuration={0} style={styles.image} testID="holder-badge-poster" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({ image: { width: "100%", height: "100%" } });

export default memo(BadgeArtwork);
