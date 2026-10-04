import BadgeArtwork from "../common/BadgeArtwork";
import React, { FC, useCallback } from "react";
import { View, Text, TouchableOpacity} from "react-native";
import SmartImage from "../common/SmartImage";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useUser } from "../../context/AuthContext";
import { getAvatarUrl } from "../../libs/misc";
import { formatCompactNumber } from "../../libs/numbers.util";
import { getBadgeUrlFor, getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import { useSearchFollowState } from "../../hooks/useSearchFollowState";
import Avatar from "../common/Avatar";
import GlassFollowButton from "../ui/GlassFollowButton";
import { reportActionError } from "../../libs/error-feedback";
import type { SearchAccountResult } from "../../services/search.service";
import type { FollowState } from "./SearchAccountChip";

interface SearchAccountCardProps {
  account: SearchAccountResult;
  onFollowChange?: (address: string, newState: FollowState) => void;
}

const SearchAccountCard: FC<SearchAccountCardProps> = ({ account, onFollowChange }) => {
  const { showUserProfile } = useUserProfileSheet();
  const authUser = useUser() as { address?: string } | null;
  const myAddress = authUser?.address;

  const isOwnAccount = !!(
    myAddress &&
    account.address &&
    myAddress.toLowerCase() === account.address.toLowerCase()
  );

  const { isFollowing, isPending, isLoading: followLoading, toggle } = useSearchFollowState(account.address, {
    isFollowing: !!account.isFollowing,
    isFollowRequestPending: !!account.isFollowRequestPending,
  });

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
      console.error("[SearchAccountCard] follow error", e);
      reportActionError(e, "Couldn't update follow");
    }
  }, [myAddress, account.address, isOwnAccount, followLoading, toggle, onFollowChange]);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const aboutMe = account.aboutMe || "";
  // Balance and grandfathered tier together, so a result row wears the badge
  // its owner wears on their own profile.
  const badgeImg = account.hideBadgeAndBalance ? undefined : getBadgeUrlFor(account);

  const renderFollowButton = () => {
    if (isOwnAccount) return null;
    return (
      <GlassFollowButton
        isFollowing={isFollowing}
        isPending={isPending}
        isLoading={followLoading}
        onPress={handleFollowToggle}
        className="px-4"
      />
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
          <Text
            className="text-white font-semibold text-sm"
            style={{ flexShrink: 1, minWidth: 0 }}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {badgeImg ? (
            <BadgeArtwork
              source={badgeImg}
              style={getBadgeOpticalStyle(badgeImg, 14, 3, 18)}
              contentFit="contain"
            />
          ) : null}
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
