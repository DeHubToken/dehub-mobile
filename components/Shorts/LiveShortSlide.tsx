/**
 * A live stream as a slide in the Shorts swiper, as on web's LiveSwipeSlide.
 * The stream plays muted, cropped upright, while the slide is on screen; a tap
 * (or the Join pill) opens the full live room with chat, gifts and sound.
 */
import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import LiveFeedPreview from "../common/LiveFeedPreview";
import Icon from "../ui/Icon";
import { ScreenNames } from "../../navigation/ScreenNames";
import type { LiveSlide } from "../../libs/live-shorts";

interface Props {
  slide: LiveSlide;
  isActive: boolean;
  height: number;
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

function LiveShortSlide({ slide, isActive, height }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const open = useCallback(() => {
    navigation.navigate(ScreenNames.LiveViewer, {
      streamId: slide.streamId,
      isLive: true,
      ...(slide.tokenId != null ? { tokenId: slide.tokenId } : {}),
    });
  }, [navigation, slide.streamId, slide.tokenId]);

  return (
    <View className="dark-surface" style={[styles.slide, { height }]}>
      <LiveFeedPreview url={slide.url} thumbnail={slide.thumbnail} active={isActive} label={slide.title} onPress={open} />
      <LinearGradient pointerEvents="none" colors={["rgba(0,0,0,0.55)", "transparent"]} style={styles.topShade} />
      <LinearGradient pointerEvents="none" colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.bottomShade} />

      <View pointerEvents="none" style={styles.badges}>
        <View style={styles.liveBadge}>
          <Text style={styles.liveText}>{t("liveShorts.live", { defaultValue: "LIVE" })}</Text>
        </View>
        {slide.viewers != null ? (
          <View style={styles.viewers}>
            <Icon name="Eye" size={12} color="#fff" />
            <Text style={styles.viewersText}>{compact(slide.viewers)}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottom} pointerEvents="box-none">
        <Text numberOfLines={1} style={styles.name}>@{slide.username || slide.displayName}</Text>
        {slide.title ? <Text numberOfLines={2} style={styles.title}>{slide.title}</Text> : null}
        <Pressable onPress={open} className="dark-surface" style={styles.join} accessibilityRole="button" accessibilityLabel={t("liveShorts.join", { defaultValue: "Join live" })}>
          <View pointerEvents="none" className="dark-surface" style={styles.joinInner}>
            <Icon name="Radio" size={16} color="#fff" />
            <Text style={styles.joinText}>{t("liveShorts.join", { defaultValue: "Join live" })}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default memo(LiveShortSlide);

const styles = StyleSheet.create({
  slide: { width: "100%", backgroundColor: "#000", overflow: "hidden" },
  topShade: { position: "absolute", top: 0, left: 0, right: 0, height: 160 },
  bottomShade: { position: "absolute", bottom: 0, left: 0, right: 0, height: 260 },
  badges: { position: "absolute", left: 16, top: 104, flexDirection: "row", alignItems: "center", gap: 8 },
  liveBadge: { backgroundColor: "#dc2626", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
  liveText: { color: "#fff", fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
  viewers: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 4 },
  viewersText: { color: "#fff", fontSize: 12 },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 48, gap: 6 },
  name: { color: "#fff", fontSize: 15, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 },
  title: { color: "#e4e4e7", fontSize: 13, textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 3 },
  join: { alignSelf: "flex-start", marginTop: 6 },
  joinInner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#dc2626", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  joinText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
