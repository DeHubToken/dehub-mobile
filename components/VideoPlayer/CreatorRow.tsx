import React, { useMemo, useCallback } from "react";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import Avatar from "../common/Avatar";
import { Ionicons } from "@expo/vector-icons";
import { getAvatarUrl, getBadgeName, getBadgeUrl } from "../../libs/misc";
import { truncateAddress } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuthActions } from "../../context/AuthContext";
import { maxStacked } from "../../libs/validators.util";

export type Creator = {
  username?: string;
  displayName?: string;
  address?: string;
  walletAddress?: string;
  avatarImageUrl?: string;
  followers?: string[] | number;
  stakedDHB?: number | string;
} | null;

interface CreatorRowProps {
  loading: boolean;
  creator: Creator;
  viewerAddress?: string;
  isFollowing: boolean;
  isFollowRequestPending?: boolean;
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
  isFollowRequestPending = false,
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
        (creator?.walletAddress ||
          creator?.address ||
          creator?.username ||
          "") as string
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
        : truncateAddress(
            creator?.address || creator?.walletAddress || "",
            4,
            4
          )) ||
      (fallbackMinter as string) ||
      "Creator"
    );
  }, [
    creator?.displayName,
    creator?.username,
    creator?.address,
    creator?.walletAddress,
    fallbackMinter,
  ]);

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
    const fromBalances = maxStacked((creator as any)?.balanceData);
    const direct = (creator as any)?.stakedDHB || 0;
    return fromBalances > 0 ? fromBalances : direct || 0;
  }, [creator]);
  const badgeName = getBadgeName(stakedDHB as any);
  const badgeImage = getBadgeUrl(stakedDHB as any);

  const profileId = useMemo(
    () =>
      (creator?.username ||
        creator?.walletAddress ||
        creator?.address ||
        (fallbackMinter != null ? String(fallbackMinter) : "")) as string,
    [
      creator?.username,
      creator?.walletAddress,
      creator?.address,
      fallbackMinter,
    ]
  );
  const { showUserProfile } = useUserProfileSheet();
  const { requireAuth } = useAuthActions();
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
        <Avatar uri={avatarUrl} size={40} onPress={handleOpenProfile} />
        <View className="flex-1 mx-2">
          <View className="flex-row items-center">
            <Text
              className="text-theme-neutrals-100 text-sm font-medium"
              numberOfLines={1}
            >
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
            ) : (
              <></>
            )}
          </View>
          <Text
            className="text-theme-neutrals-500 text-[10px]"
            numberOfLines={1}
          >
            {formatCompactNumber(followerCount)} followers
          </Text>
        </View>
      </TouchableOpacity>
      {!isSelf ? (
        isFollowRequestPending ? (
          <TouchableOpacity
            onPress={handlePress}
            disabled={followLoading}
            className="border border-theme-neutrals-600 px-4 py-2 rounded-xl flex-row items-center gap-1"
            activeOpacity={0.85}
          >
            {followLoading && (
              <ActivityIndicator size="small" color="#fff" />
            )}
            <Text className="text-white text-xs font-semibold">Requested</Text>
          </TouchableOpacity>
        ) : !isFollowing ? (
          <AccentButtonGradient style={{ borderRadius: 12 }}>
            <TouchableOpacity
              onPress={handlePress}
              disabled={followLoading}
              className="px-4 py-2 flex-row items-center gap-1"
              style={{ backgroundColor: 'transparent' }}
              activeOpacity={0.85}
            >
              {followLoading && (
                <ActivityIndicator size="small" color="#fff" />
              )}
              <Text className="text-theme-neutrals-900 text-xs font-semibold">Follow</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
        ) : (
          <TouchableOpacity
            onPress={handlePress}
            disabled={followLoading}
            className="bg-theme-neutrals-800 px-4 py-2 rounded-xl flex-row items-center gap-1"
            activeOpacity={0.85}
          >
            {followLoading && (
              <ActivityIndicator size="small" color="#fff" />
            )}
            <Text className="text-white text-xs font-semibold">Following</Text>
          </TouchableOpacity>
        )
      ) : null}
    </View>
  );
};

export default React.memo(CreatorRow);
