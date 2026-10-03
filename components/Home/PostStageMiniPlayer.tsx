import React, { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import SmartImage from "../common/SmartImage";
import Icon from "../ui/Icon";
import IosGlassPill from "../ui/IosGlassPill";
import { StageGlassSquare, useStageBack } from "./PostStage";
import { usePostStage } from "../../libs/postStage";
import { useAppTheme } from "../../context/ThemeContext";

export const MINI_PLAYER_HEIGHT = 60;

interface Props {
  tokenId: string | number | null | undefined;
  visible: boolean;
  /** Tapping the strip: back up to the media. */
  onPress: () => void;
}

/**
 * The strip pinned to the top of the post page once its media has scrolled
 * away: back, a small thumbnail with a progress line, the title over
 * "creator · time", play/pause for video, audio and live, and a like. The
 * player itself keeps running in the page; this only mirrors and drives it.
 * Android draws it solid, iOS in the shared glass.
 */
function PostStageMiniPlayerComponent({ tokenId, visible, onPress }: Props) {
  const { t } = useTranslation();
  const { isMinimal, skin } = useAppTheme();
  const media = usePostStage(tokenId);
  const back = useStageBack();
  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(shown, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible, shown]);

  const radius = skin?.square ? 0 : 12;
  const ios = Platform.OS === "ios";
  // Solid on Android: the page colour of the theme, lifted a touch so the
  // strip reads as a surface over the comments.
  const solid = isMinimal ? "#000000" : skin ? skin.page : "#141416";
  const border = isMinimal ? "#2C2C2C" : "rgba(255,255,255,0.12)";
  const progress = Math.min(1, Math.max(0, media.progress ?? 0));

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      style={[
        styles.wrap,
        { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
      ]}
      testID="post-stage-mini"
    >
      <View style={[styles.strip, { borderRadius: radius, borderColor: border }]}>
        {ios ? (
          <IosGlassPill tint="rgba(10,10,12,0.42)" borderRadius={radius} />
        ) : (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: solid, borderRadius: radius }]} />
        )}
        <StageGlassSquare icon="ArrowLeft" label={t("common.goBack")} onPress={back} plain size={36} flip />
        <Pressable
          onPress={onPress}
          style={styles.main}
          accessibilityRole="button"
          accessibilityLabel={media.title}
        >
          <View style={[styles.thumb, { borderRadius: skin?.square ? 0 : 8 }]}>
            {media.thumb ? (
              <SmartImage source={{ uri: media.thumb }} style={StyleSheet.absoluteFill} recyclingKey={media.thumb} />
            ) : null}
            {media.playable ? (
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress * 100}%` }]} />
              </View>
            ) : null}
          </View>
          <View style={styles.text}>
            <Text numberOfLines={1} style={styles.title}>{media.title}</Text>
            {media.subtitle ? <Text numberOfLines={1} style={styles.sub}>{media.subtitle}</Text> : null}
          </View>
        </Pressable>
        {media.playable ? (
          <Pressable
            // Before the in-page player has started there is nothing to
            // toggle yet: the button takes the reader back to it instead.
            onPress={media.toggle ?? onPress}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={media.playing ? t("audioPost.pause") : t("audioPost.play")}
            style={styles.icon}
          >
            <Icon name={media.playing ? "Pause" : "Play"} size={20} color="#FFFFFF" fill="#FFFFFF" />
          </Pressable>
        ) : null}
        {media.like ? (
          <Pressable
            onPress={media.like}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t("reactionInfo.labels.like")}
            accessibilityState={{ selected: !!media.liked }}
            style={[styles.icon, styles.likeBox, { borderRadius: skin?.square ? 0 : 10 }]}
          >
            <Icon name="ThumbsUp" size={18} color="#FFFFFF" fill={media.liked ? "#FFFFFF" : undefined} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 6, left: 8, right: 8, zIndex: 30 },
  strip: {
    height: MINI_PLAYER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  thumb: { width: 64, height: 40, overflow: "hidden", backgroundColor: "#27272A" },
  track: { position: "absolute", left: 0, right: 0, bottom: 0, height: 3, backgroundColor: "rgba(255,255,255,0.25)" },
  fill: { height: 3, backgroundColor: "#FFFFFF" },
  text: { flex: 1, minWidth: 0 },
  title: { color: "#F4F4F5", fontSize: 14, fontWeight: "700" },
  sub: { color: "#A1A1AA", fontSize: 12, marginTop: 1 },
  icon: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  likeBox: { backgroundColor: "rgba(255,255,255,0.08)" },
});

const PostStageMiniPlayer = memo(PostStageMiniPlayerComponent);
export default PostStageMiniPlayer;
