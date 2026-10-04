import BadgeArtwork from "../common/BadgeArtwork";
import { getBadgeHoverOpticalStyle } from "../../libs/misc";
import React, { FC, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import SmartImage from "../common/SmartImage";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useUser } from "../../context/AuthContext";
import { getAvatarUrl, getBadgeUrl } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import { useSearchFollowState } from "../../hooks/useSearchFollowState";
import Avatar from "../common/Avatar";
import GlassFollowButton from "../ui/GlassFollowButton";
import { reportActionError } from "../../libs/error-feedback";
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
  const authUser = useUser() as { address?: string } | null;
  const myAddress = authUser?.address;

  const isOwnAccount = !!(myAddress && account.address && myAddress.toLowerCase() === account.address.toLowerCase());

  const { isFollowing, isPending, isLoading: followLoading, toggle } = useSearchFollowState(account.address, {
    isFollowing: !!account.isFollowing,
    isFollowRequestPending: !!account.isFollowRequestPending,
  });

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const badgeImage = getBadgeUrl(account.hideBadgeAndBalance ? 0 : (account.badgeBalance ?? 0), { username: account.username });

  const handlePress = useCallback(() => {
    const identifier = account.username || account.address;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [account.username, account.address, showUserProfile]);

  const handleFollowToggle = useCallback(async () => {
    if (!myAddress || !account.address || isOwnAccount || followLoading) return;
    try {
      const next = await toggle();
      if (next) onFollowChange?.(account.address, { isFollowing: next.isFollowing, isFollowRequestPending: !!next.isFollowRequestPending });
    } catch (e) {
      console.error("[SearchAccountChip] follow error", e);
      reportActionError(e, "Couldn't update follow");
    }
  }, [myAddress, account.address, isOwnAccount, followLoading, toggle, onFollowChange]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="w-[150px] items-center rounded-xl py-3.5 px-3 mr-2.5"
      style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' }}
    >
      <Avatar uri={displayAvatar} size={72} name={displayName} />

      <View className="flex-row items-center mt-2 px-0.5" style={{ maxWidth: 130 }}>
        <Text
          className="text-white text-sm font-semibold text-center flex-shrink"
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {badgeImage ? (
          <BadgeArtwork
            source={badgeImage}
            style={getBadgeHoverOpticalStyle(badgeImage, 14, 0, 20)}
            contentFit="contain"
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
