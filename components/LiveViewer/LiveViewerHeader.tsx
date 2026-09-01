/**
 * The live viewer's top bar.
 *
 * Drawn from the same kit as the shorts viewer (components/common/ViewerChrome)
 * rather than its own set of black/50 circles and hairline borders: a rounded
 * card on the left, a 40pt chrome button per control on the right. A viewer
 * opening a stream and a viewer opening a short now see one app.
 */
import React, { memo, useCallback, useMemo } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import {
  ChromeFill,
  CHROME_GAP,
  CHROME_HIT_SLOP,
  CHROME_RADIUS,
  CHROME_SIZE,
  EDGE,
  TEXT_SHADOW,
} from "../common/ViewerChrome";
import { getAvatarUrl, getBadgeUrlFor } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
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
  isLive: boolean;
  isPaused: boolean;
  isEnded: boolean;
  viewerCount: number;
  fallbackMinter?: string | number;
  /** Opens the shared post options sheet — the same one every other post has. */
  onOptionsPress?: () => void;
}

const LiveViewerHeader: React.FC<LiveViewerHeaderProps> = ({
  creator,
  creatorLoading,
  isFollowing,
  followLoading,
  onFollow,
  onUnfollow,
  viewerAddress,
  isLive,
  isPaused,
  isEnded,
  viewerCount,
  fallbackMinter,
  onOptionsPress,
}) => {
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuthActions();

  const avatarUrl = useMemo(
    () => getAvatarUrl(creator?.avatarImageUrl) || undefined,
    [creator?.avatarImageUrl]
  );

  const displayName = useMemo(() => {
    if (creatorLoading) return "Loading...";
    return (
      creator?.displayName ||
      creator?.username ||
      truncateAddress(creator?.address || creator?.walletAddress || "", 4, 4) ||
      (fallbackMinter ? String(fallbackMinter) : "Creator")
    );
  }, [creator, creatorLoading, fallbackMinter]);

  const followerCount = useMemo(
    () =>
      typeof creator?.followers === "number"
        ? creator.followers
        : Array.isArray(creator?.followers)
          ? creator!.followers!.length
          : 0,
    [creator?.followers]
  );

  const badgeImage = getBadgeUrlFor(creator as any);

  const isSelf = useMemo(() => {
    const v = (viewerAddress || "").toLowerCase();
    const t = (creator?.walletAddress || creator?.address || "").toLowerCase();
    return !!v && !!t && v === t;
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

  /**
   * Monochrome, per the design system: the state is carried by the dot's
   * opacity and the label, never by a hue. Paused and ended were previously
   * two different greys that read as the same colour anyway.
   */
  const statusLabel = isPaused
    ? "PAUSED"
    : isLive
      ? "LIVE"
      : isEnded
        ? "ENDED"
        : "OFFLINE";

  const statusDim = !isLive || isPaused;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {/* Creator card */}
      <Pressable
        onPress={handleOpenProfile}
        style={styles.creatorCard}
        accessibilityRole="button"
        accessibilityLabel={"Open profile of " + displayName}
      >
        <ChromeFill />
        <Avatar
          uri={avatarUrl}
          size={36}
          onPress={handleOpenProfile}
          name={displayName}
          style={styles.avatar}
        />
        <View style={styles.creatorText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            {badgeImage ? (
              <Image source={badgeImage} style={styles.badge} />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <View style={styles.statusChip}>
              <View
                style={[styles.statusDot, statusDim ? styles.statusDotDim : null]}
              />
              <Text style={styles.statusText}>{statusLabel}</Text>
            </View>
            <Text style={styles.meta} numberOfLines={1}>
              {formatCompactNumber(Math.max(0, viewerCount))} watching
              {" · "}
              {formatCompactNumber(followerCount)} followers
            </Text>
          </View>
        </View>
      </Pressable>

      <View style={styles.controls}>
        {/* Follow — the one filled control on the frame, as on the feed card. */}
        {!isSelf && !creatorLoading && creator && (
          <Pressable
            onPress={handleFollowPress}
            disabled={followLoading}
            hitSlop={CHROME_HIT_SLOP}
            style={[
              styles.followButton,
              isFollowing ? null : styles.followButtonSolid,
              followLoading ? styles.pending : null,
            ]}
            accessibilityRole="button"
          >
            {isFollowing ? <ChromeFill /> : null}
            <Text
              style={[
                styles.followLabel,
                isFollowing ? styles.followingLabel : styles.followLabelSolid,
              ]}
            >
              {isFollowing ? "Following" : "Follow"}
            </Text>
          </Pressable>
        )}

        {/* Options — save, share, report, block and the owner actions. The
            stream page was the only post surface in the app without it. */}
        {onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <ChromeFill />
            <Icon name="Ellipsis" size={20} color="#fff" />
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleClose}
          hitSlop={CHROME_HIT_SLOP}
          style={styles.chromeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <ChromeFill />
          <Icon name="X" size={20} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: EDGE,
    paddingTop: EDGE,
    paddingBottom: 10,
    gap: CHROME_GAP,
  },
  /**
   * Real padding on all four sides — the old pill had pl-1/py-1 around a 32pt
   * avatar, which left the image touching the left edge and the text crowding
   * the right.
   */
  creatorCard: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: CHROME_RADIUS,
    padding: 8,
    gap: 8,
    overflow: "hidden",
  },
  /** Web draws avatars as rounded squares; Avatar's own 16% would give 6. */
  avatar: {
    borderRadius: 10,
  },
  creatorText: {
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  name: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
  badge: {
    width: 12,
    height: 12,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#fff",
  },
  statusDotDim: {
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  statusText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  meta: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_GAP,
  },
  chromeButton: {
    width: CHROME_SIZE,
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followButton: {
    height: CHROME_SIZE,
    paddingHorizontal: 14,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  followButtonSolid: {
    backgroundColor: "#fff",
  },
  pending: {
    opacity: 0.6,
  },
  followLabel: {
    fontSize: 13,
    fontWeight: "700",
  },
  followLabelSolid: {
    color: "#09090B",
  },
  followingLabel: {
    color: "rgba(255,255,255,0.85)",
  },
});

export default memo(LiveViewerHeader);
