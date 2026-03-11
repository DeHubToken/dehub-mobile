import React, { FC, useCallback } from "react";
import { FlatList, View, Text, TouchableOpacity } from "react-native";
import AccountSkeleton from "./AccountSkeleton";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { getAvatarUrl } from "../../libs";
import { formatCompactNumber } from "../../libs/numbers.util";
import Avatar from "../common/Avatar";

export interface AccountItem {
  _id?: string;
  id?: string | number;
  username?: string;
  address?: string;
  followers?: number;
  likes?: number;
  tipsSentTotal?: number; // assumed field name
  tipsReceivedTotal?: number; // assumed field name
  about?: string; // short bio/about me
  avatarImageUrl?: string; // direct avatar field
  avatarUrl?: string; // alternative
  createdAt?: string;
  created_at?: string;
  [key: string]: any; // allow extra backend fields
}

interface SearchAccountsListProps {
  data: AccountItem[];
  loadingMore: boolean;
  onLoadMore: () => void;
  hasMore?: boolean;
}

const SearchAccountsList: FC<SearchAccountsListProps> = ({
  data,
  loadingMore,
  onLoadMore,
  hasMore = false,
}) => {
  const { showUserProfile } = useUserProfileSheet();

  const handlePress = useCallback(
    (identifier?: string) => {
      if (!identifier) return;
      showUserProfile(identifier);
    },
    [showUserProfile]
  );

  if (data.length === 0 && !loadingMore) {
    return (
      <View>
        {Array.from({ length: 6 }).map((_, i) => (
          <AccountSkeleton key={i} />
        ))}
      </View>
    );
  }
  return (
    <FlatList
      data={data}
      keyExtractor={(item, idx) => {
        const created = item.createdAt || item.created_at || "nocreated";
        const base =
          item._id || item.id || item.username || item.address || idx;
        return `${base}-${created}-${idx}`;
      }}
      onEndReachedThreshold={0.6}
      onEndReached={onLoadMore}
      ListFooterComponent={
        <View className="py-4">
          {loadingMore && (
            <View>
              {Array.from({ length: 3 }).map((_, i) => (
                <AccountSkeleton key={`acc-sk-${i}`} />
              ))}
            </View>
          )}
          {!loadingMore && !hasMore && data.length > 0 && (
            <Text className="text-center text-theme-neutrals-600 text-[10px] mt-2">
              End of accounts results
            </Text>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const username =
          item.username || item.address?.slice(0, 6) || "unknown";
        const avatarSrc = getAvatarUrl(
          item.avatarImageUrl || item.avatarUrl || ""
        );
  const displayAvatar = avatarSrc && avatarSrc !== "default-avatar" ? avatarSrc : undefined;
        const sent = item.sentTips ?? item.tipsSentTotal ?? 0;
        const received = item.receivedTips ?? item.tipsReceivedTotal ?? 0;
        const about = item.aboutMe || "";
        return (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handlePress(item.username || item.address)}
            className="px-4 py-3 border-b border-theme-neutrals-800 flex-row"
          >
            <Avatar uri={displayAvatar} size={40} name={username} />
            <View className="flex-1 ml-3">
              <View className="flex-row items-center justify-between">
                <Text className="text-white font-medium" numberOfLines={1}>
                  @{username}
                </Text>
                {/* <Text
                  className="text-theme-neutrals-500 text-[10px] ml-2"
                  numberOfLines={1}
                >
                  Sent {formatCompactNumber(sent)} • Received {formatCompactNumber(received)}
                </Text> */}
              </View>
              {about ? (
                <Text
                  className="text-theme-neutrals-400 text-[11px] mt-1"
                  numberOfLines={2}
                >
                  {about}
                </Text>
              ) : (
                <Text
                  className="text-theme-neutrals-600 text-[10px] mt-1"
                  numberOfLines={1}
                >
                  No bio
                </Text>
              )}
              <Text className="text-theme-neutrals-600 text-[10px] mt-1">
                Tip activity: Sent {formatCompactNumber(sent)} / Received {formatCompactNumber(received)}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
};

export default SearchAccountsList;
