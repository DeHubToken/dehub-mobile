import BadgeArtwork from "../common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../../libs/misc";
/**
 * The live viewer's top bar.
 *
 * One row, laid out the way every live app on a phone lays it out: a compact
 * creator pill on the left with the follow button hung straight off it, then
 * the audience count, then the two ways out — collapse the chrome, or leave.
 * The previous version gave the creator card the whole left half of the screen
 * and stacked status, viewers and followers into it, which pushed everything
 * else into a second line and read as a settings row rather than as chrome
 * over a video.
 *
 * Nothing on it is boxed: the face carries Follow as a small chrome-glass +,
 * the name sits on the picture, and mute, options and close are bare white
 * icons. Phone web (ImmersiveLiveChrome) draws the same row, so iPhone Safari,
 * Android and both apps look identical. White only, no hue anywhere. Stream state moved out to the pill row
 * underneath (LiveViewerPills) where it sits beside the title.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import { formatDistance } from "date-fns";
import Icon from "../ui/Icon";
import { LinearGradient } from "expo-linear-gradient";
import { CHROME_HIT_SLOP, EDGE, TEXT_SHADOW } from "../common/ViewerChrome";
import { getAvatarUrl, getBadgeUrlFor } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { useNavigation } from "@react-navigation/native";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuthActions } from "../../context/AuthContext";

type Creator = {
  username?: string;
  displayName?: string;
  address?: string;
  walletAddress?: string;
  avatarImageUrl?: string;
  followers?: string[] | number;
  badgeBalance?: number;
  stakedDHB?: number | string;
} | null;

interface LiveViewerHeaderProps {
  creator: Creator;
  creatorLoading: boolean;
  isFollowing: boolean;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  viewerAddress?: string;
  /** When the broadcast started, for "Started 12 minutes ago". */
  startedAt?: Date | null;
  /** Sends the live ripple out from behind the face. */
  isLive?: boolean;
  fallbackMinter?: string | number;
  /** Opens the shared post options sheet — the same one every other post has. */
  onOptionsPress?: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

const LiveViewerHeader: React.FC<LiveViewerHeaderProps> = ({
  creator,
  creatorLoading,
  isFollowing,
  followLoading,
  onFollow,
  onUnfollow,
  viewerAddress,
  startedAt,
  isLive,
  fallbackMinter,
  onOptionsPress,
  isMuted,
  onToggleMute,
}) => {
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuthActions();
  const { t } = useTranslation();
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setMinuteTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [startedAt]);

  const avatarUrl = useMemo(
    () => getAvatarUrl(creator?.avatarImageUrl) || undefined,
    [creator?.avatarImageUrl]
  );

  const displayName = useMemo(() => {
    if (creatorLoading) return "…";
    return (
      creator?.displayName ||
      creator?.username ||
      truncateAddress(creator?.address || creator?.walletAddress || "", 4, 4) ||
      (fallbackMinter ? String(fallbackMinter) : t("liveViewer.creator"))
    );
  }, [creator, creatorLoading, fallbackMinter, t]);

  const badgeImage = getBadgeUrlFor(creator as any);

  const isSelf = useMemo(() => {
    const v = (viewerAddress || "").toLowerCase();
    const t2 = (creator?.walletAddress || creator?.address || "").toLowerCase();
    return !!v && !!t2 && v === t2;
  }, [viewerAddress, creator]);

  const profileId = useMemo(
    () =>
      (creator?.username ||
        creator?.walletAddress ||
        creator?.address ||
        (fallbackMinter != null ? String(fallbackMinter) : "")) as string,
    [creator, fallbackMinter]
  );

  const handleOpenProfile = useCallback(() => {
    if (profileId) showUserProfile(profileId);
  }, [profileId, showUserProfile]);

  const handleClose = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
  }, [navigation]);

  const handleFollowPress = useCallback(() => {
    if (isSelf) return;
    requireAuth(() => {
      if (isFollowing) onUnfollow();
      else onFollow();
    });
  }, [isSelf, requireAuth, isFollowing, onUnfollow, onFollow]);

  const showFollow = !isSelf && !creatorLoading && !!creator && !isFollowing;

  const startedLabel = useMemo(() => {
    if (!startedAt) return null;
    return t("liveViewer.startedAgo", {
      time: formatDistance(startedAt, new Date(), { addSuffix: true }),
    });
    // Re-read each minute through `minuteTick`, so "2 minutes ago" moves on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt, t, minuteTick]);

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {/* Who started this, straight on the picture: the face with the live
          ripple and Follow as a small glass + on it, then name, badge and
          when they went live. No capsule, so nothing boxes the top left,
          and phone web draws the same thing. */}
      <View style={styles.creator}>
        <View style={styles.avatarSlot}>
          <Avatar
            uri={avatarUrl}
            size={36}
            onPress={handleOpenProfile}
            name={displayName}
            live={!!isLive}
          />
          {/* Gone once following: an already-followed creator does not need
              a button parked on their own stream. */}
          {showFollow ? (
            <Pressable
              onPress={handleFollowPress}
              disabled={followLoading}
              hitSlop={10}
              // Keeps its own chrome glass: themes repaint plain buttons.
              className="dark-surface"
              style={[styles.followBadge, followLoading ? styles.pending : null]}
              accessibilityRole="button"
              accessibilityLabel={t("follow.follow", { defaultValue: "Follow" })}
            >
              {/* Solid chrome glass: an opaque fill under a sheen and a rim,
                  so the picture never shows through. */}
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(255,255,255,0.32)", "rgba(255,255,255,0.06)", "rgba(255,255,255,0.16)"]}
                locations={[0, 0.55, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.followSheen} />
              <Icon name="Plus" size={12} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={handleOpenProfile}
          style={styles.creatorText}
          accessibilityRole="button"
          accessibilityLabel={t("liveViewer.openProfileOf", { name: displayName })}
        >
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {badgeImage ? (
              <BadgeArtwork source={badgeImage} style={getBadgeHoverOpticalStyle(badgeImage, 13, 0, 18.2)} />
            ) : null}
          </View>
          {startedLabel ? (
            <Text style={styles.meta} numberOfLines={1}>
              {startedLabel}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {/* Bare icons, no box: the top scrim and a shadow carry the contrast. */}
      <View style={styles.controls}>
        <Pressable onPress={onToggleMute} hitSlop={CHROME_HIT_SLOP} style={styles.chromeButton}
          accessibilityRole="button" accessibilityLabel={isMuted ? t("common.unmute") : t("common.mute")}>
          <ShadowedIcon name={isMuted ? "VolumeX" : "Volume2"} size={21} />
        </Pressable>
        {onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel={t("postOptions.options", { defaultValue: "Options" })}
          >
            <ShadowedIcon name="EllipsisVertical" size={21} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleClose}
          hitSlop={CHROME_HIT_SLOP}
          style={styles.chromeButton}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", { defaultValue: "Close" })}
        >
          <ShadowedIcon name="X" size={22} />
        </Pressable>
      </View>
    </View>
  );
};

/**
 * A white icon with a soft shadow under it. RN draws no shadow from an SVG on
 * Android, so the shadow is the same glyph in black, one point lower.
 */
const ShadowedIcon: React.FC<{ name: React.ComponentProps<typeof Icon>["name"]; size: number }> = ({ name, size }) => (
  <View style={{ width: size, height: size }}>
    <View pointerEvents="none" style={styles.iconShadow}>
      <Icon name={name} size={size} color="rgba(0,0,0,0.45)" />
    </View>
    <Icon name={name} size={size} color="#fff" />
  </View>
);

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: EDGE - 4,
    paddingTop: EDGE,
    gap: 6,
  },
  /** Takes the row's spare width; the name truncates before the controls move. */
  creator: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingLeft: 4,
    gap: 10,
  },
  avatarSlot: {
    margin: 2,
  },
  creatorText: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
  meta: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    ...TEXT_SHADOW,
  },
  controls: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  chromeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  iconShadow: {
    position: "absolute",
    top: 1,
    left: 0,
  },
  followBadge: {
    position: "absolute",
    right: -6,
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#27272A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  /** The bright top edge of the glass. */
  followSheen: {
    position: "absolute",
    top: 0,
    left: 2,
    right: 2,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  pending: {
    opacity: 0.6,
  },
});

export default memo(LiveViewerHeader);
