import React, { memo, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { I18nManager, Image, Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import IosGlassPill from "../ui/IosGlassPill";
import { getBadgeOpticalStyle } from "../../libs/misc";
import { openBadgeShowcase, tierForBadgeImage } from "../../libs/badgeShowcase";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useAppTheme } from "../../context/ThemeContext";
import { MONO_TEXT } from "../../theme/skins";

/** Glass squares: rounded rectangles, never circles. */
export const STAGE_SQUARE = 40;
export const STAGE_SQUARE_RADIUS = 10;

// Android has no safe backdrop blur: a near-solid smoked square. Not an even
// grey on purpose, so the theme pass leaves it alone over the picture.
const ANDROID_SQUARE = "rgba(20,20,22,0.78)";
const IOS_SQUARE_TINT = "rgba(0,0,0,0.16)";

type GlassSquareProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Sits on a theme surface rather than over the media. */
  plain?: boolean;
  size?: number;
  flip?: boolean;
};

export function StageGlassSquare({ icon, label, onPress, plain, size = STAGE_SQUARE, flip }: GlassSquareProps) {
  const { skin } = useAppTheme();
  const radius = skin?.square ? 0 : STAGE_SQUARE_RADIUS;
  const ios = Platform.OS === "ios" && !plain;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.square,
        { width: size, height: size, borderRadius: radius, opacity: pressed ? 0.7 : 1 },
        plain
          ? { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.10)" }
          : ios
            ? { backgroundColor: "transparent", borderWidth: 0 }
            : { backgroundColor: ANDROID_SQUARE, borderColor: "rgba(255,255,255,0.18)" },
      ]}
    >
      {ios ? <IosGlassPill tint={IOS_SQUARE_TINT} borderRadius={radius} /> : null}
      <View style={flip && I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}>
        <Icon name={icon} size={20} color="#FFFFFF" />
      </View>
    </Pressable>
  );
}

/** Leaves the post page the same way the old header did, keyboard first. */
export function useStageBack() {
  const navigation = useNavigation<any>();
  const lock = useRef(false);
  return useCallback(() => {
    if (lock.current) return;
    lock.current = true;
    setTimeout(() => { lock.current = false; }, 600);
    Keyboard.dismiss();
    if (navigation.canGoBack?.()) navigation.goBack();
  }, [navigation]);
}

type ChromeProps = {
  onAi?: () => void;
  onMore?: () => void;
  /** Over the media (immersive) or as a plain row above a text post. */
  overMedia: boolean;
};

/** Back, Ask AI and ⋯ — over the media as glass squares, or a plain row. */
export const PostStageChrome = memo(function PostStageChrome({ onAi, onMore, overMedia }: ChromeProps) {
  const { t } = useTranslation();
  const back = useStageBack();
  return (
    <View
      pointerEvents="box-none"
      style={overMedia ? styles.chromeOver : styles.chromeRow}
      testID="post-stage-chrome"
    >
      <StageGlassSquare icon="ArrowLeft" label={t("common.goBack")} onPress={back} plain={!overMedia} flip />
      <View style={{ flex: 1 }} pointerEvents="none" />
      {onAi ? <StageGlassSquare icon="Sparkles" label={t("postOptions.askAi")} onPress={onAi} plain={!overMedia} /> : null}
      {onMore ? <StageGlassSquare icon="Ellipsis" label={t("player.moreOptions")} onPress={onMore} plain={!overMedia} /> : null}
    </View>
  );
});

/** Video utilities belong to the details panel under the player. */
export const PostStageActions = memo(function PostStageActions({ onAi, onMore, onBoost }: { onAi: () => void; onMore: () => void; onBoost?: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 4, marginTop: 8 }} testID="post-panel-actions">
      {onBoost ? <StageGlassSquare icon="Zap" label={t("postOptions.boostPost")} onPress={onBoost} plain size={32} /> : null}
      <StageGlassSquare icon="Sparkles" label={t("postOptions.askAi")} onPress={onAi} plain size={32} />
      <StageGlassSquare icon="Ellipsis" label={t("player.moreOptions")} onPress={onMore} plain size={32} />
    </View>
  );
});

type CreatorProps = {
  avatarUrl?: string;
  displayName: string;
  username?: string;
  followers?: number;
  badgeImage?: any;
  onUserPress: () => void;
  /** Hidden on the viewer's own post. */
  showFollow: boolean;
  following: boolean;
  pending: boolean;
  onFollow: () => void;
};

/** The creator under the media: avatar, name and badge, handle · followers, Follow. */
export const PostStageCreator = memo(function PostStageCreator({
  avatarUrl,
  displayName,
  username,
  followers,
  badgeImage,
  onUserPress,
  showFollow,
  following,
  pending,
  onFollow,
}: CreatorProps) {
  const { t } = useTranslation();
  const { skin } = useAppTheme();
  const badgeRef = useRef<View>(null);
  const mono = skin?.mono ? MONO_TEXT : null;
  const sub = [
    username ? `@${username}` : null,
    followers != null && followers > 0 ? t("follow.countFollowers", { compact: formatCompactNumber(followers) }) : null,
  ].filter(Boolean).join(" · ");
  const followed = following || pending;
  return (
    <View style={styles.creator} testID="post-stage-creator">
      <Pressable onPress={onUserPress} hitSlop={6} style={styles.identity} accessibilityRole="button" accessibilityLabel={displayName}>
        <Avatar uri={avatarUrl && avatarUrl !== "default-avatar" ? avatarUrl : undefined} size={40} name={displayName || username} />
        <View style={styles.identityText}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, mono]}>{displayName}</Text>
            {badgeImage ? (
              <Pressable
                ref={badgeRef}
                onPress={() => openBadgeShowcase(tierForBadgeImage(badgeImage), badgeRef.current)}
                hitSlop={6}
                style={styles.badge}
              >
                <Image source={badgeImage} style={getBadgeOpticalStyle(badgeImage, 16, 0, 20)} resizeMode="contain" fadeDuration={0} />
              </Pressable>
            ) : null}
          </View>
          {sub ? <Text numberOfLines={1} style={styles.handle}>{sub}</Text> : null}
        </View>
      </Pressable>
      {showFollow ? (
        <Pressable
          onPress={onFollow}
          accessibilityRole="button"
          accessibilityState={{ selected: followed }}
          style={({ pressed }) => [
            styles.follow,
            { borderRadius: skin?.square ? 0 : 10, opacity: pressed ? 0.8 : 1 },
            followed ? styles.followOn : styles.followOff,
          ]}
        >
          {/* The white fill is a plain view under the label: as the button's
              own fill it is an even neutral, which the theme pass repaints. */}
          {!followed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.followFill]} /> : null}
          <Text style={[styles.followText, { color: followed ? "#F4F4F5" : "#09090B" }]}>
            {pending ? t("follow.requested") : following ? t("follow.following") : t("follow.follow")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  square: { alignItems: "center", justifyContent: "center", borderWidth: 1, overflow: "hidden" },
  chromeOver: {
    position: "absolute",
    top: 10,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 10,
  },
  chromeRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 10, paddingBottom: 4 },
  creator: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 2 },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  identityText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4, height: 20 },
  name: { color: "#F9FBFF", fontSize: 15.5, fontWeight: "700", flexShrink: 1 },
  badge: { height: 20, justifyContent: "center" },
  handle: { color: "#A6A9AC", fontSize: 13, marginTop: 1 },
  follow: { height: 34, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  followOff: { borderColor: "#FFFFFF", overflow: "hidden" },
  followFill: { backgroundColor: "#FFFFFF" },
  followOn: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.16)" },
  followText: { fontSize: 14, fontWeight: "700" },
});
