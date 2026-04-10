import React, { FC, useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuth } from "../../context/AuthContext";
import { getAvatarUrl, getBadgeUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import { followUser, unfollowUser } from "../../services/user.service";
import Avatar from "../common/Avatar";
import GlassFollowButton from "../ui/GlassFollowButton";
import type { SearchAccountResult } from "../../services/search.service";

interface SearchAccountChipProps {
  account: SearchAccountResult;
  onFollowChange?: (address: string, newState: FollowState) => void;
}

export interface FollowState {
  isFollowing: boolean;
  isFollowRequestPending: boolean;
}

const SearchAccountChip: FC<SearchAccountChipProps> = ({ account, onFollowChange }) => {
  const { showUserProfile } = useUserProfileSheet();
  const { user: authUser } = useAuth() as { user: { address?: string } | null };
  const myAddress = authUser?.address;

  const isOwnAccount = !!(myAddress && account.address && myAddress.toLowerCase() === account.address.toLowerCase());

  const [isFollowing, setIsFollowing] = useState(!!account.isFollowing);
  const [isPending, setIsPending] = useState(!!account.isFollowRequestPending);
  const [followLoading, setFollowLoading] = useState(false);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const badgeImage = getBadgeUrl(account.badgeBalance ?? 0);

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
      console.error("[SearchAccountChip] follow error", e);
    } finally {
      setFollowLoading(false);
    }
  }, [myAddress, account.address, isOwnAccount, isFollowing, isPending, onFollowChange]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="w-[150px] items-center rounded-xl py-3.5 px-3 mr-2.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
    >
      <Avatar uri={displayAvatar} size={72} rounded={false} name={displayName} />

      <View className="flex-row items-center mt-2 px-0.5" style={{ maxWidth: 130 }}>
        <Text
          className="text-white text-xs font-semibold text-center flex-shrink"
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {badgeImage ? (
          <Image
            source={badgeImage}
            style={{ width: 14, height: 14, marginLeft: 3 }}
            resizeMode="contain"
          />
        ) : null}
      </View>
      <Text
        className="text-theme-neutrals-400 text-[10px] text-center"
        numberOfLines={1}
      >
        @{username}
      </Text>
      <Text className="text-theme-neutrals-500 text-[10px] mt-0.5">
        {formatCompactNumber(followers)} followers
      </Text>

      {!isOwnAccount && (
        <GlassFollowButton
          isFollowing={isFollowing}
          isPending={isPending}
          isLoading={followLoading}
          onPress={handleFollowToggle}
          className="mt-2.5 w-full"
        />
      )}
    </TouchableOpacity>
  );
};

export default React.memo(SearchAccountChip);
