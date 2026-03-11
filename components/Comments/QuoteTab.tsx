import React, { memo, useCallback, useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { getQuotePosts } from "../../services/repost.service";
import HomeFeedCard from "../Home/HomeFeedCard";
import VideoCard from "../Home/VideoCard";

const PAGE_LIMIT = 20;

interface QuoteTabProps {
  tokenId: number | string;
}

const QuoteTabComponent: React.FC<QuoteTabProps> = ({ tokenId }) => {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const fetchQuotes = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (pageNum === 1) {
        isRefresh ? setRefreshing(true) : setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await getQuotePosts({ tokenId, page: pageNum, limit: PAGE_LIMIT });
        if (pageNum === 1) {
          setPosts(res.result);
        } else {
          setPosts((prev) => [...prev, ...res.result]);
        }
        setHasMore(res.pagination?.hasMore ?? false);
        setPage(pageNum);
      } catch (e) {
        console.error("[QuoteTab] fetchQuotes error:", e);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [tokenId],
  );

  useEffect(() => {
    fetchQuotes(1);
  }, [fetchQuotes]);

  const handleRefresh = useCallback(() => {
    fetchQuotes(1, true);
  }, [fetchQuotes]);

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      fetchQuotes(page + 1);
    }
  }, [loadingMore, hasMore, loading, page, fetchQuotes]);

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      if (item.postType === "video") {
        return (
          <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
            <VideoCard nft={item} />
          </View>
        );
      }
      return (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <HomeFeedCard item={item} />
        </View>
      );
    },
    [],
  );

  const keyExtractor = useCallback(
    (item: any) => String(item.tokenId || item.id || item._id),
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
      data={posts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
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
          <Text style={{ color: "#8B8D90", fontSize: 14 }}>No quotes yet.</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }}
    />
  );
};

export const QuoteTab = memo(QuoteTabComponent);
export default QuoteTab;
