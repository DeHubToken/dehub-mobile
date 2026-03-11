import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import FeedCard from "../Home/FeedCard";
import Icon from "../ui/Icon";
import { theme } from "../../theme";
import {
  getUserReposts,
  type GetUserRepostsResponse,
} from "../../services/repost.service";
import type { UnifiedFeedItem } from "../../services/feed.unified.service";


interface UserRepostsListProps {
  address: string;
  contentPadding: number;
  scrollEnabled?: boolean;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  headerComponent?: React.ReactNode;
  contentContainerStyle?: Record<string, unknown>;
  onClose?: () => void;
}

export interface UserRepostsListRef {
  scrollToOffset: (params: { offset: number; animated: boolean }) => void;
}

const PAGE_SIZE = 20;


const UserRepostsListInner: React.ForwardRefRenderFunction<
  UserRepostsListRef,
  UserRepostsListProps
> = (
  {
    address,
    contentPadding,
    scrollEnabled,
    onScroll,
    headerComponent,
    contentContainerStyle,
    onClose,
  },
  ref,
) => {
  const listRef = useRef<FlatList<any>>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasMoreRef = useRef(true);
  const pageRef = useRef(1);

  useImperativeHandle(ref, () => ({
    scrollToOffset: (params) => listRef.current?.scrollToOffset(params),
  }));


  const fetchPage = useCallback(
    async (page: number, replace: boolean) => {
      const res: GetUserRepostsResponse = await getUserReposts({
        address,
        page,
        limit: PAGE_SIZE,
      });
      hasMoreRef.current = res.pagination?.hasMore ?? res.result.length >= PAGE_SIZE;
      pageRef.current = page;
      if (replace) {
        setItems(res.result);
      } else {
        setItems((prev) => [...prev, ...res.result]);
      }
    },
    [address],
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPage(1, true)
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Failed to load reposts");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchPage(1, true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Refresh failed";
      setError(msg);
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage]);

  const handleEndReached = useCallback(async () => {
    if (loadingMore || loading) return;
    if (!hasMoreRef.current) return;
    setLoadingMore(true);
    try {
      await fetchPage(pageRef.current + 1, false);
    } catch {
      // keep existing items
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, fetchPage]);


  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<any>) => {
      const repostHeader = item.isRepost ? (
        <View className="flex-row items-center gap-1.5 mb-1">
          <Icon name="Repeat2" size={14} color="#9CA3AF" />
          <Text className="text-xs text-theme-neutrals-400">
            Reposted
          </Text>
        </View>
      ) : null;

      return (
        <View style={{ paddingHorizontal: contentPadding }}>
          {repostHeader}
          <FeedCard item={item as UnifiedFeedItem} onBeforeNavigate={onClose} />
        </View>
      );
    },
    [contentPadding, onClose],
  );

  const keyExtractor = useCallback(
    (item: any, index: number) =>
      `repost-${item.tokenId ?? item.id ?? index}-${item.repostedAt ?? item.createdAt}`,
    [],
  );


  if (loading && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center py-16">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-theme-neutrals-400 text-sm mb-3">{error}</Text>
          <View className="px-5 py-2 rounded-full bg-theme-neutrals-700">
            <Text
              onPress={handleRefresh}
              className="text-theme-neutrals-50 font-medium text-sm"
            >
              Retry
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <View className="flex-1">
        {!!headerComponent && <View>{headerComponent}</View>}
        <View className="flex-1 items-center justify-center px-8 py-16">
          <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
            <Icon name="Repeat2" size={40} color="#666" />
          </View>
          <Text className="text-white text-lg font-bold text-center mb-2">
            No Reposts Yet
          </Text>
          <Text className="text-gray-400 text-center text-sm leading-5">
            When this user reposts content, it'll show up here.
          </Text>
        </View>
      </View>
    );
  }


  return (
    <FlatList
      ref={listRef}
      data={items}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      scrollEnabled={scrollEnabled}
      onScroll={onScroll}
      scrollEventThrottle={16}
      ListHeaderComponent={headerComponent as React.ReactElement | null}
      contentContainerStyle={contentContainerStyle}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.4}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={7}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={theme.colors.accentForeground}
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <View className="py-6 items-center">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : !hasMoreRef.current && items.length > 0 ? (
          <View className="px-4 py-6 items-center">
            <Text className="text-theme-neutrals-400 text-xs">No more reposts</Text>
          </View>
        ) : null
      }
    />
  );
};

export const UserRepostsList = forwardRef(UserRepostsListInner);
export default UserRepostsList;
