import React, { FC, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getAvatarUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import Avatar from "../common/Avatar";
import type { SearchAccountResult } from "../../services/search.service";

interface SearchAccountCardProps {
  account: SearchAccountResult;
}

const SearchAccountCard: FC<SearchAccountCardProps> = ({ account }) => {
  const { showUserProfile } = useUserProfileSheet();

  const handlePress = useCallback(() => {
    const identifier = account.username || account.address;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [account.username, account.address, showUserProfile]);

  const username = account.username || account.address?.slice(0, 6) || "unknown";
  const displayName = account.displayName || username;
  const avatarSrc = getAvatarUrl(account.avatarImageUrl || "");
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
  const followers = account.followers ?? 0;
  const aboutMe = account.aboutMe || "";

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handlePress}
      className="py-3 flex-row items-center border-b border-theme-neutrals-800"
    >
      <Avatar uri={displayAvatar} size={48} />
      <View className="flex-1 ml-3">
        <View className="flex-row items-center">
          <Text className="text-white font-semibold text-sm" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        <Text className="text-theme-neutrals-400 text-xs mt-0.5" numberOfLines={1}>
          @{username}
        </Text>
        {aboutMe ? (
          <Text
            className="text-theme-neutrals-500 text-xs mt-1"
            numberOfLines={2}
          >
            {aboutMe}
          </Text>
        ) : null}
        <Text className="text-theme-neutrals-600 text-[10px] mt-1">
          {formatCompactNumber(followers)} followers
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default SearchAccountCard;
