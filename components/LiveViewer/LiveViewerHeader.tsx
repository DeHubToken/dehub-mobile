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
import React, { memo, useCallback, useMemo } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
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
  viewerCount: number;
  fallbackMinter?: string | number;
  /** Opens the shared post options sheet — the same one every other post has. */
  onOptionsPress?: () => void;
  /** Drops the chrome and keeps the picture. The chevron, as on every live app. */
  onCollapse?: () => void;
}

const LiveViewerHeader: React.FC<LiveViewerHeaderProps> = ({
  creator,
  creatorLoading,
  isFollowing,
  followLoading,
  onFollow,
  onUnfollow,
  viewerAddress,
  viewerCount,
  fallbackMinter,
  onOptionsPress,
  onCollapse,
}) => {
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuthActions();
  const { t } = useTranslation();

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

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {/* Creator pill + follow. Grouped and shrink together, so a long name
          gives up characters before the follow button gives up the row. */}
      <View style={styles.left}>
        <Pressable
          onPress={handleOpenProfile}
          style={styles.creatorCard}
          accessibilityRole="button"
          accessibilityLabel={"Open profile of " + displayName}
        >
          <ChromeFill />
          <Avatar
            uri={avatarUrl}
            size={30}
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
              <Icon name="Heart" size={9} color="rgba(255,255,255,0.7)" fill="rgba(255,255,255,0.7)" />
              <Text style={styles.meta} numberOfLines={1}>
                {formatCompactNumber(Math.max(0, followerCount))}
              </Text>
            </View>
          </View>
        </Pressable>

        {/* The one filled control on the frame. It disappears once following —
            an already-followed creator does not need a button parked on their
            own stream, and the row gets the width back. */}
        {showFollow ? (
          <Pressable
            onPress={handleFollowPress}
            disabled={followLoading}
            hitSlop={CHROME_HIT_SLOP}
            style={[styles.followButton, followLoading ? styles.pending : null]}
            accessibilityRole="button"
          >
            <Icon name="Plus" size={13} color="#09090B" strokeWidth={2.5} />
            <Text style={styles.followLabel}>
              {t("follow.follow", { defaultValue: "Follow" })}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.controls}>
        {/* Audience. A count, not an avatar stack: the socket carries a number
            and inventing faces for it would be a lie at a glance. */}
        <View style={styles.viewerChip} pointerEvents="none">
          <ChromeFill />
          <Icon name="Eye" size={13} color="#fff" strokeWidth={1.8} />
          <Text style={styles.viewerCount}>
            {formatCompactNumber(Math.max(0, viewerCount))}
          </Text>
        </View>

        {onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel={t("postOptions.options", { defaultValue: "Options" })}
          >
            <ChromeFill />
            <Icon name="Ellipsis" size={18} color="#fff" />
          </Pressable>
        ) : null}

        {onCollapse ? (
          <Pressable
            onPress={onCollapse}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel={t("common.fullscreen", { defaultValue: "Fullscreen" })}
          >
            <ChromeFill />
            <Icon name="ChevronDown" size={20} color="#fff" />
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleClose}
          hitSlop={CHROME_HIT_SLOP}
          style={styles.chromeButton}
          accessibilityRole="button"
          accessibilityLabel={t("common.close", { defaultValue: "Close" })}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: EDGE,
    paddingTop: EDGE,
    gap: 8,
  },
  left: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  /**
   * A capsule, not a card: over a moving picture the fully rounded shape reads
   * as a floating tag, and it is the same silhouette as every other control on
   * the row now that they are all circles.
   */
  creatorCard: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    paddingLeft: 5,
    paddingRight: 12,
    gap: 7,
    overflow: "hidden",
  },
  /** Web draws avatars as rounded squares; this is the kit radius, less 2. */
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
    fontWeight: "700",
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
    gap: 3,
    marginTop: 1,
  },
  meta: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    fontWeight: "600",
    flexShrink: 1,
    ...TEXT_SHADOW,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_GAP - 4,
  },
  viewerChip: {
    flexDirection: "row",
    alignItems: "center",
    height: CHROME_SIZE,
    borderRadius: CHROME_RADIUS,
    paddingHorizontal: 11,
    gap: 5,
    overflow: "hidden",
  },
  viewerCount: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    ...TEXT_SHADOW,
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
    height: CHROME_SIZE - 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 12,
    borderRadius: CHROME_RADIUS,
    backgroundColor: "#fff",
  },
  pending: {
    opacity: 0.6,
  },
  followLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#09090B",
  },
});

export default memo(LiveViewerHeader);
