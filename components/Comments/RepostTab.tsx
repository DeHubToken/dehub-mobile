import React, { memo, useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import {
  getRepostUsers,
  RepostUser,
} from "../../services/repost.service";
import { getAvatarUrl } from "../../libs/misc";
import { truncate } from "../../libs/strings.util";
import { formatCompactNumber } from "../../libs/numbers.util";

const PAGE_LIMIT = 20;

interface RepostUserRowProps {
  item: RepostUser;
  onPress: (address: string) => void;
}

const RepostUserRow: React.FC<RepostUserRowProps> = memo(({ item, onPress }) => {
  const displayName =
    item.displayName || item.username || truncate(item.address, 12, "..");
  const hasUsername = !!item.username;
  const avatarUrl = getAvatarUrl(item.avatarImageUrl);

  const handlePress = useCallback(() => {
    onPress(item.address);
  }, [onPress, item.address]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Avatar uri={avatarUrl} size={40} rounded={false} name={displayName} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={{ color: "#F9FBFF", fontWeight: "600", fontSize: 14 }} numberOfLines={1}>
          {displayName}
        </Text>
        {hasUsername && (
          <Text style={{ color: "#8B8D90", fontSize: 13, marginTop: 1 }} numberOfLines={1}>
            @{item.username}
          </Text>
        )}
        {item.followers !== undefined && (
          <Text style={{ color: "#8B8D90", fontSize: 12, marginTop: 2 }}>
            {formatCompactNumber(item.followers)} followers
          </Text>
        )}
      </View>
      <Icon name="ChevronRight" size={16} color="#6F7174" />
    </Pressable>
  );
});

interface RepostTabProps {
  tokenId: number | string;
}

const RepostTabComponent: React.FC<RepostTabProps> = ({ tokenId }) => {
  const { showUserProfile } = useUserProfileSheet();

  const [users, setUsers] = useState<RepostUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchReposts = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (pageNum === 1) {
        isRefresh ? setRefreshing(true) : setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await getRepostUsers({ tokenId, page: pageNum, limit: PAGE_LIMIT });
        if (pageNum === 1) {
          setUsers(res.result);
        } else {
          setUsers((prev) => [...prev, ...res.result]);
        }
        setHasMore(res.pagination?.hasMore ?? false);
        setPage(pageNum);
      } catch (e) {
        console.error("[RepostTab] fetchReposts error:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [tokenId],
  );

  useEffect(() => {
    fetchReposts(1);
  }, [fetchReposts]);

  const handleRefresh = useCallback(() => {
    fetchReposts(1, true);
  }, [fetchReposts]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      fetchReposts(page + 1);
    }
  }, [loadingMore, hasMore, loading, page, fetchReposts]);

  const handleUserPress = useCallback(
    (address: string) => {
      showUserProfile(address);
    },
    [showUserProfile],
  );

  const renderItem = useCallback(
    ({ item }: { item: RepostUser }) => (
      <RepostUserRow item={item} onPress={handleUserPress} />
    ),
    [handleUserPress],
  );

  const keyExtractor = useCallback((item: RepostUser) => item.address, []);

  const separator = useCallback(
    () => (
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          backgroundColor: "rgba(255,255,255,0.06)",
          marginLeft: 68,
        }}
      />
    ),
    [],
  );

  const footer = useMemo(() => {
    if (loadingMore) {
      return (
        <View style={{ paddingVertical: 24, alignItems: "center" }}>
          <ActivityIndicator size="small" color="#F9FBFF" />
        </View>
      );
    }
    return <View style={{ height: 24 }} />;
  }, [loadingMore]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#F9FBFF" />
      </View>
    );
  }

  return (
    <FlatList
      data={users}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      ItemSeparatorComponent={separator}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#F9FBFF"
          progressBackgroundColor="#1a1a1a"
        />
      }
      ListFooterComponent={footer}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
          <Text style={{ color: "#8B8D90", fontSize: 14 }}>No reposts yet.</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1 }}
    />
  );
};

import { StyleSheet } from "react-native";

export const RepostTab = memo(RepostTabComponent);
export default RepostTab;
