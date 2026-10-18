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
 * Everything is drawn from components/common/ViewerChrome, so this and the
 * shorts viewer stay one surface: zinc-900 fills, 12pt radii, 40pt buttons,
 * white icons, no hue anywhere. Stream state moved out to the pill row
 * underneath (LiveViewerPills) where it sits beside the title.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import Avatar from "../common/Avatar";
import { formatDistance } from "date-fns";
import { useAppTheme } from "../../context/ThemeContext";
import { liveAccent } from "./liveAccent";
import Icon from "../ui/Icon";
import {
  ChromeFill,
  CHROME_GAP,
  CHROME_HIT_SLOP,
  CHROME_RADIUS,
  EDGE,
  TEXT_SHADOW,
} from "../common/ViewerChrome";
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
  const { theme, accent } = useAppTheme();
  const followTint = liveAccent(theme, accent);
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
      {/* One capsule for who started this: face with the live ripple, name and
          badge, when they went live, and Follow inside it so the row reads
          as one thing about one person. */}
      <Pressable
        onPress={handleOpenProfile}
        style={styles.creatorCard}
        accessibilityRole="button"
        accessibilityLabel={t("liveViewer.openProfileOf", { name: displayName })}
      >
        <ChromeFill glass radius={CHROME_RADIUS + 2} />
        {/* Same broadcast ripple every other live avatar wears. The margin
            keeps the spacing the old ring took up. */}
        <View style={styles.avatarSlot}>
          <Avatar
            uri={avatarUrl}
            size={32}
            onPress={handleOpenProfile}
            name={displayName}
            live={!!isLive}
          />
        </View>
        <View style={styles.creatorText}>
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
        </View>

        {/* Gone once following: an already-followed creator does not need a
            button parked on their own stream. */}
        {showFollow ? (
          <Pressable
            onPress={handleFollowPress}
            disabled={followLoading}
            hitSlop={CHROME_HIT_SLOP}
            style={[styles.followButton, { backgroundColor: followTint }, followLoading ? styles.pending : null]}
            accessibilityRole="button"
            accessibilityLabel={t("follow.follow", { defaultValue: "Follow" })}
          >
            <Text style={styles.followText} numberOfLines={1}>
              {t("follow.follow", { defaultValue: "Follow" })}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>

      <View style={styles.controls}>
        <Pressable onPress={onToggleMute} hitSlop={CHROME_HIT_SLOP} style={styles.chromeButton}
          accessibilityRole="button" accessibilityLabel={isMuted ? t("common.unmute") : t("common.mute")}>
          <ChromeFill glass />
          <Icon name={isMuted ? "VolumeX" : "Volume2"} size={19} color="#fff" />
        </Pressable>
        {onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel={t("postOptions.options", { defaultValue: "Options" })}
          >
            <ChromeFill glass />
            <Icon name="EllipsisVertical" size={18} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleClose}
          hitSlop={CHROME_HIT_SLOP}
          style={styles.chromeButton}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", { defaultValue: "Close" })}
        >
          <ChromeFill glass />
          <Icon name="X" size={19} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: EDGE - 4,
    paddingTop: EDGE,
    gap: 6,
  },
  /** Takes the row's spare width; the name truncates before the controls move. */
  creatorCard: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 48,
    borderRadius: CHROME_RADIUS + 2,
    paddingLeft: 5,
    paddingRight: 6,
    gap: 8,
    overflow: "hidden",
  },
  avatarSlot: {
    margin: 3,
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
    color: "rgba(255,255,255,0.75)",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 1,
    ...TEXT_SHADOW,
  },
  controls: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_GAP - 6,
  },
  chromeButton: {
    width: 40,
    height: 40,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  followText: {
    color: "#09090B",
    fontSize: 12.5,
    fontWeight: "800",
  },
  pending: {
    opacity: 0.6,
  },
});

export default memo(LiveViewerHeader);
