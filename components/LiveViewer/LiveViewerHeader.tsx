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
import { DhbCoin } from "../common/DhbCoin";
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
  /** How many are watching, right now.
   *
   * On the name's own line rather than in a chip of its own: followers,
   * watching and gifts are three facts about one stream, and split across
   * two places they read as facts about two different things.
   */
  viewerCount?: number;
  likeCount?: number;
  /** Gifts sent to this stream, all told. */
  giftCount?: number;
  fallbackMinter?: string | number;
  /** Opens the shared post options sheet — the same one every other post has. */
  onOptionsPress?: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
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
  likeCount,
  giftCount,
  fallbackMinter,
  onOptionsPress,
  isMuted,
  onToggleMute,
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

  return (
    <View style={styles.bar} pointerEvents="box-none">
      {/* Creator pill + follow. Grouped and shrink together, so a long name
          gives up characters before the follow button gives up the row. */}
      <View style={styles.left}>
        <Pressable
          onPress={handleOpenProfile}
          style={styles.creatorCard}
          accessibilityRole="button"
          accessibilityLabel={t("liveViewer.openProfileOf", { name: displayName })}
        >
          <ChromeFill sheer />
          <Avatar
            uri={avatarUrl}
            size={34}
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
                {formatCompactNumber(Math.max(0, likeCount ?? 0))}
              </Text>
              {viewerCount != null ? (
                <>
                  <Icon name="Eye" size={10} color="rgba(255,255,255,0.7)" strokeWidth={2} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {formatCompactNumber(Math.max(0, viewerCount))}
                  </Text>
                </>
              ) : null}
              {giftCount != null ? (
                <>
                  <DhbCoin size={10} />
                  <Text style={styles.meta} numberOfLines={1}>
                    {formatCompactNumber(Math.max(0, giftCount))}
                  </Text>
                </>
              ) : null}
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
            accessibilityLabel={t("follow.follow", { defaultValue: "Follow" })}
          >
            <Icon name="Plus" size={20} color="#09090B" strokeWidth={2.5} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable onPress={onToggleMute} hitSlop={CHROME_HIT_SLOP} style={styles.chromeButton}
          accessibilityRole="button" accessibilityLabel={isMuted ? t("common.unmute") : t("common.mute")}>
          <ChromeFill sheer />
          <Icon name={isMuted ? "VolumeX" : "Volume2"} size={20} color="#fff" />
        </Pressable>
        {onOptionsPress ? (
          <Pressable
            onPress={onOptionsPress}
            hitSlop={CHROME_HIT_SLOP}
            style={styles.chromeButton}
            accessibilityRole="button"
            accessibilityLabel={t("postOptions.options", { defaultValue: "Options" })}
          >
            <ChromeFill sheer />
            <Icon name="EllipsisVertical" size={18} color="#fff" />
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
            <ChromeFill sheer />
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
          <ChromeFill sheer />
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
    gap: 4,
  },
  /**
   * Takes the row's spare width and gives it up before the controls do.
   * On a 375pt screen the header was a capsule, a follow button and four
   * controls arguing over the same line, and the name — which truncates —
   * was the one that lost.
   */
  left: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  /**
   * A capsule, not a card: over a moving picture the fully rounded shape reads
   * as a floating tag, and it is the same silhouette as every other control on
   * the row now that they are all circles.
   */
  creatorCard: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    // 48, not the kit's 40: the name and the three numbers under it need
    // 30pt between them, and at 40 they sat hard against the rounded corner
    // they are drawn in — which reads as clipped whether or not it is.
    height: 48,
    borderRadius: CHROME_RADIUS,
    paddingLeft: 6,
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
    gap: 4,
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
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: CHROME_GAP - 4,
  },
  /** 48, with the capsule: one height across the row. */
  chromeButton: {
    width: 40,
    height: 48,
    borderRadius: CHROME_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  /**
   * A square, like the rest of the row. The word cost about 60pt on a
   * 375pt line and the creator capsule paid it, so the name came out
   * truncated with the numbers squeezed under it. A filled plus on a
   * creator's own stream is not ambiguous, and the label stays for a
   * screen reader.
   */
  followButton: {
    width: 40,
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: CHROME_RADIUS,
    backgroundColor: "#fff",
  },
  pending: {
    opacity: 0.6,
  },
});

export default memo(LiveViewerHeader);
