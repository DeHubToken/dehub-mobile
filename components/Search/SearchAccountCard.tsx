import React, { FC, useCallback, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Icon from "../ui/Icon";
import { useAuth } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import { followUser, unfollowUser } from "../../services/user.service";
import Avatar from "../common/Avatar";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import type { SearchAccountResult } from "../../services/search.service";
import type { FollowState } from "./SearchAccountChip";

interface SearchAccountCardProps {
  account: SearchAccountResult;
  onFollowChange?: (address: string, newState: FollowState) => void;
}

const SearchAccountCard: FC<SearchAccountCardProps> = ({ account, onFollowChange }) => {
  const { showUserProfile } = useUserProfileSheet();
  const { user: authUser } = useAuth() as { user: { address?: string } | null };
  const myAddress = authUser?.address;

  const isOwnAccount = !!(
    myAddress &&
    account.address &&
    myAddress.toLowerCase() === account.address.toLowerCase()
  );

  const [isFollowing, setIsFollowing] = useState(!!account.isFollowing);
  const [isPending, setIsPending] = useState(!!account.isFollowRequestPending);
  const [followLoading, setFollowLoading] = useState(false);

  const handlePress = useCallback(() => {
    const identifier = account.username || account.address;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [account.username, account.address, showUserProfile]);

  const handleFollowToggle = useCallback(async () => {
    if (!myAddress || !account.address || isOwnAccount) return;
    setFollowLoading(true);
    try {
      if (isFollowing || isPending) {
        await unfollowUser(myAddress, account.address);
        setIsFollowing(false);
        setIsPending(false);
        onFollowChange?.(account.address, { isFollowing: false, isFollowRequestPending: false });
      } else {
        const res = await followUser(myAddress, account.address);
        if (res.status === "pending") {
          setIsPending(true);
          setIsFollowing(false);
          onFollowChange?.(account.address, { isFollowing: false, isFollowRequestPending: true });
        } else {
          setIsFollowing(true);
          setIsPending(false);
          onFollowChange?.(account.address, { isFollowing: true, isFollowRequestPending: false });
        }
      }
    } catch (e) {
      console.error("[SearchAccountCard] follow error", e);
    } finally {
      setFollowLoading(false);
    }
  }, [myAddress, account.address, isOwnAccount, isFollowing, isPending, onFollowChange]);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const aboutMe = account.aboutMe || "";

  // Follow button
  const renderFollowButton = () => {
    if (isOwnAccount) return null;

    if (followLoading) {
      return (
        <View className="w-[88px] h-8 items-center justify-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }

    if (isPending) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="bg-theme-neutrals-700 rounded-full px-3 h-8 flex-row items-center justify-center"
        >
          <Icon name="Clock" size={13} color="#9CA3AF" />
          <Text className="text-theme-neutrals-400 text-[11px] font-semibold ml-1">
            Requested
          </Text>
        </TouchableOpacity>
      );
    }

    if (isFollowing) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="bg-theme-neutrals-700 rounded-full px-4 h-8 items-center justify-center"
        >
          <Text className="text-theme-neutrals-300 text-[11px] font-semibold">
            Following
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <AccentButtonGradient style={{ borderRadius: 16 }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleFollowToggle}
          className="px-4 h-8 items-center justify-center"
        >
          <Text className="text-white text-[11px] font-bold">Follow</Text>
        </TouchableOpacity>
      </AccentButtonGradient>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="py-3 flex-row items-center border-b border-theme-neutrals-800"
    >
      <Avatar uri={displayAvatar} size={48} name={displayName} />
      <View className="flex-1 ml-3 mr-2">
        <View className="flex-row items-center">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        {/* <Text className="text-theme-neutrals-400 text-xs mt-0.5" numberOfLines={1}>
          @{username}
        </Text> */}
        {aboutMe ? (
          <Text className="text-theme-neutrals-500 text-xs mt-1" numberOfLines={2}>
            {aboutMe}
          </Text>
        ) : null}
        <Text className="text-theme-neutrals-600 text-[10px] mt-1">
          {formatCompactNumber(followers)} followers
        </Text>
      </View>
      {renderFollowButton()}
    </TouchableOpacity>
  );
};

export default React.memo(SearchAccountCard);
