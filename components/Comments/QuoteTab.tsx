import React, { memo, useCallback, useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
} from "react-native";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import { getQuotePosts } from "../../services/repost.service";
import FeedCard from "../Home/FeedCard";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";

const PAGE_LIMIT = 20;

interface QuoteTabProps {
  tokenId: number | string;
  /**
   * The sheet is drawn inside a Shorts page rather than a Modal, so this list
   * is nested in the Shorts pager FlatList. React Native then measures this
   * list's viewport from the pager's offset, not its own scroll, so from the
   * second Short on no card ever counts as on screen and a video quote could
   * not even be tapped to play. Skip visibility tracking there: every card may
   * hold a player, none autoplays over the Short, and a tap plays it.
   */
  nested?: boolean;
}

const QuoteTabComponent: React.FC<QuoteTabProps> = ({ tokenId, nested = false }) => {
  const { t } = useTranslation();
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

  const keyExtractor = useCallback(
    (item: any) => String(item.tokenId || item.id || item._id),
    [],
  );

  const {
    viewabilityConfig,
    onViewableItemsChanged,
    isItemVisible,
    isItemAutoplayActive,
    visibilityExtraData,
  } = useFeedCardVisibility(keyExtractor);

  const renderItem = useCallback(
    ({ item }: { item: any }) => {
      const key = keyExtractor(item);
      return (
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <FeedCard
            item={item}
            isVisible={nested || isItemVisible(key)}
            isAutoplayActive={!nested && isItemAutoplayActive(key)}
          />
        </View>
      );
    },
    [nested, keyExtractor, isItemVisible, isItemAutoplayActive],
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
        <DeHubLoader size={56} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
      data={posts}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      // Nested, the window is placed from the pager's offset too, so keep the
      // default wide window there or rows further down render blank.
      windowSize={nested ? undefined : 7}
      maxToRenderPerBatch={nested ? undefined : 4}
      initialNumToRender={nested ? undefined : 4}
      viewabilityConfig={nested ? undefined : viewabilityConfig}
      onViewableItemsChanged={nested ? undefined : onViewableItemsChanged}
      extraData={visibilityExtraData}
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.3}
      refreshControl={
        <DeHubRefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#F9FBFF"
          progressBackgroundColor="#1a1a1a"
        />
      }
      ListFooterComponent={footer}
      ListEmptyComponent={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 64 }}>
          <Text style={{ color: "#8B8D90", fontSize: 14 }}>{t("comments.noQuotesYet")}</Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }}
      />
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
};

export const QuoteTab = memo(QuoteTabComponent);
export default QuoteTab;
