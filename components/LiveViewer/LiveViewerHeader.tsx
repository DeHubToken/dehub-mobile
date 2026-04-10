import React, { memo, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { X } from "lucide-react-native";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
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

  const stakedDHB = useMemo(() => {
    if (!creator) return 0;
    return resolveBadgeBalance(creator as any);
  }, [creator]);
  const badgeImage = getBadgeUrl(stakedDHB);

  const isSelf = useMemo(() => {
    const v = (viewerAddress || "").toLowerCase();
    const t = (
      creator?.walletAddress ||
      creator?.address ||
      ""
    ).toLowerCase();
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

  const statusDotColor = isPaused
    ? "#eab308"
    : isLive
      ? "#ef4444"
      : isEnded
        ? "#6b7280"
        : "#6b7280";

  const statusLabel = isPaused
    ? "PAUSED"
    : isLive
      ? "LIVE"
      : isEnded
        ? "ENDED"
        : "OFFLINE";

  return (
    <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
      {/* Creator pill */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleOpenProfile}
        className="flex-row items-center bg-black/50 rounded-full pr-3 pl-1 py-1 border border-white/10"
        style={{ maxWidth: "70%" }}
      >
        <Avatar
          uri={avatarUrl}
          size={32}
          onPress={handleOpenProfile}
          borderWidth={2}
          borderColor={isLive ? "#ef4444" : "#333"}
          name={displayName}
        />
        <View className="ml-2 mr-2 flex-shrink">
          <View className="flex-row items-center">
            <Text
              className="text-white text-xs font-bold"
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {badgeImage ? (
              <Image source={badgeImage} className="w-3 h-3 ml-1" />
            ) : null}
          </View>
          <Text className="text-white/50 text-[10px]" numberOfLines={1}>
            {formatCompactNumber(followerCount)} followers
          </Text>
        </View>

        {/* LIVE badge */}
        {(isLive || isPaused) && (
          <View className="flex-row items-center bg-black/40 rounded-full px-2 py-0.5 mr-1">
            <View
              className="w-1.5 h-1.5 rounded-full mr-1"
              style={{ backgroundColor: statusDotColor }}
            />
            <Text
              className="text-[9px] font-bold"
              style={{ color: statusDotColor }}
            >
              {statusLabel}
            </Text>
          </View>
        )}

        {/* Viewer count */}
        <View className="flex-row items-center bg-black/40 rounded-full px-2 py-0.5">
          <Text className="text-white/70 text-[10px]">
            👁 {formatCompactNumber(Math.max(0, viewerCount))}
          </Text>
        </View>
      </TouchableOpacity>

      <View className="flex-row items-center">
        {/* Follow button */}
        {!isSelf && !creatorLoading && creator && (
          <TouchableOpacity
            onPress={handleFollowPress}
            disabled={followLoading}
            activeOpacity={0.8}
            className={`rounded-full px-3 py-1.5 mr-2 ${
              isFollowing
                ? "bg-white/10 border border-white/20"
                : "bg-red-500"
            } ${followLoading ? "opacity-60" : ""}`}
          >
            <Text
              className={`text-[11px] font-bold ${
                isFollowing ? "text-white/70" : "text-white"
              }`}
            >
              {isFollowing ? "Following" : "Follow"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Close button */}
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
          className="w-8 h-8 rounded-full bg-black/50 items-center justify-center border border-white/10"
        >
          <X color="#fff" size={16} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default memo(LiveViewerHeader);
