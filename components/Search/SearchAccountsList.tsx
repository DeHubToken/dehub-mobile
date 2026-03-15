import React, { FC, useCallback } from "react";
import { FlatList, View, Text } from "react-native";
import AccountSkeleton from "./AccountSkeleton";
import SearchAccountCard from "./SearchAccountCard";
import type { SearchAccountResult } from "../../services/search.service";

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
        const account: SearchAccountResult = {
          address: item.address || "",
          username: item.username,
          displayName: item.displayName || item.username,
          avatarImageUrl: item.avatarImageUrl || item.avatarUrl,
          aboutMe: item.aboutMe || item.about,
          followers: item.followers,
          badgeBalance: item.badgeBalance,
          isFollowing: item.isFollowing,
          isFollowRequestPending: item.isFollowRequestPending,
        };
        return (
          <View className="px-4">
            <SearchAccountCard account={account} />
          </View>
        );
      }}
    />
  );
};

export default SearchAccountsList;
