import React, { useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getAvatarUrl, getBadgeName, getBadgeUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";

export type Creator = {
  username?: string;
  displayName?: string;
  address?: string;
  walletAddress?: string;
  avatarImageUrl?: string;
  followers?: string[];
  stakedDHB?: number | string;
} | null;

interface CreatorRowProps {
  loading: boolean;
  creator: Creator;
  viewerAddress?: string;
  isFollowing: boolean;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  fallbackMinter?: string | number | undefined;
}

const SAMPLE_THUMB = "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg";

const CreatorRow: React.FC<CreatorRowProps> = ({
  loading,
  creator,
  viewerAddress,
  isFollowing,
  followLoading,
  onFollow,
  onUnfollow,
  fallbackMinter,
}) => {
  const lowerViewer = useMemo(
    () => (viewerAddress || "").toLowerCase(),
    [viewerAddress]
  );
  const targetAddr = useMemo(
    () =>
      (
        (creator?.walletAddress || creator?.address || creator?.username || "") as string
      ).toLowerCase(),
    [creator?.walletAddress, creator?.address, creator?.username]
  );
  const isSelf = useMemo(
    () => !!lowerViewer && !!targetAddr && lowerViewer === targetAddr,
    [lowerViewer, targetAddr]
  );

  const avatarUrl = useMemo(
    () => getAvatarUrl(creator?.avatarImageUrl) || SAMPLE_THUMB,
    [creator?.avatarImageUrl]
  );
  const displayName = useMemo(() => {
    const hasUsername = !!creator?.username;
    return (
      creator?.displayName ||
      (hasUsername
        ? (creator?.username as string)
        : truncateAddress(creator?.address || creator?.walletAddress || "", 4, 4)) ||
      (fallbackMinter as string) ||
      "Creator"
    );
  }, [creator?.displayName, creator?.username, creator?.address, creator?.walletAddress, fallbackMinter]);

  const followerCount = useMemo(
    () => (Array.isArray(creator?.followers) ? creator!.followers!.length : 0),
    [creator?.followers]
  );
  const stakedForBadge = creator?.stakedDHB || 0;
  const badgeName = getBadgeName(stakedForBadge as any);
  const badgeImage = getBadgeUrl(stakedForBadge as any);

  const profileId = useMemo(
    () =>
      (
        creator?.username ||
        creator?.walletAddress ||
        creator?.address ||
        (fallbackMinter != null ? String(fallbackMinter) : "")
      ) as string,
    [creator?.username, creator?.walletAddress, creator?.address, fallbackMinter]
  );
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuth();
  const handleOpenProfile = useCallback(() => {
    if (!profileId) return;
    showUserProfile(profileId);
  }, [profileId, showUserProfile]);

  const handlePress = useCallback(() => {
    if (isSelf) return;
    requireAuth(() => {
      if (isFollowing) onUnfollow();
      else onFollow();
    });
  }, [isSelf, isFollowing, onFollow, onUnfollow, requireAuth]);

  if (loading) {
    return (
      <View className="flex-row items-center mt-4">
        <View className="w-10 h-10 rounded-full mr-3 bg-theme-neutrals-800 animate-pulse" />
        <View className="flex-1">
          <View className="h-3 w-32 bg-theme-neutrals-800 rounded mb-2 animate-pulse" />
          <View className="h-3 w-24 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>
        <View className="px-8 py-2 rounded-full bg-theme-neutrals-800 ml-2" />
      </View>
    );
  }

  // If loading is done but creator is not available, render nothing
  if (!creator) return null;

  return (
    <View className="flex-row items-center mt-4">
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handleOpenProfile}
        className="flex-row items-center flex-1"
      >
        <Image source={{ uri: avatarUrl }} className="w-10 h-10 rounded-full mr-3" />
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className="text-theme-neutrals-100 text-sm font-medium" numberOfLines={1}>
              {displayName}
            </Text>
            {badgeName ? (
              badgeImage ? (
                <Image source={badgeImage} className="w-3 h-3 ml-1" />
              ) : (
                <Ionicons
                  name="trophy-outline"
                  size={10}
                  color="gold"
                  style={{ marginLeft: 4 }}
                />
              )
            ) : <></>}
          </View>
          <Text className="text-theme-neutrals-500 text-[10px]" numberOfLines={1}>
            {formatCompactNumber(followerCount)} followers
          </Text>
        </View>
      </TouchableOpacity>
      {!isSelf ? (
        <TouchableOpacity
          onPress={handlePress}
          disabled={followLoading}
          className={`px-4 py-2 rounded-lg ${isFollowing ? "bg-theme-neutrals-800" : "bg-theme-accent"} ${followLoading ? "opacity-60" : ""}`}
          activeOpacity={0.85}
        >
          <Text className={`text-xs font-semibold ${isFollowing ? "text-theme-neutrals-100" : "text-theme-neutrals-900"}`}>
            {isFollowing ? "Following" : "Follow"}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default React.memo(CreatorRow);
