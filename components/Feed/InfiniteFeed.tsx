import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIsFocused, useNavigation, useScrollToTop } from "@react-navigation/native";
import {
  View,
  FlatList,
  RefreshControl,
  ListRenderItem,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
} from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { getFeedNFTs, type GetNFTsResult, type GetNFTsResponse, type SearchParams } from "../../services";
import FeedCardSkeleton from "./FeedCardSkeleton";

export interface InfiniteFeedProps {
  params?: Partial<SearchParams>;
  pageSize?: number;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  onEndReachedAll?: () => void;
  renderItem: ListRenderItem<GetNFTsResult>;
  keyExtractor?: (item: GetNFTsResult, index: number) => string;
  emptyComponent?: React.ReactNode;
  /** Optional custom page fetcher override. If provided, it will be used instead of getFeedNFTs. */
  fetchPage?: (page: number, unit: number) => Promise<GetNFTsResponse>;
  /** Optional external ref for driving scroll (e.g. bottom sheet collapse-to-top). */
  listRef?: React.RefObject<FlatList<any> | null>;
  /** Controls scroll enablement (e.g. disable when sheet is collapsed). */
  scrollEnabled?: boolean;
  /** Optional scroll handler (supports Reanimated worklet handlers). */
  onScroll?: any;
  /** Disable back-to-top affordance (useful when onScroll is driven by Reanimated). */
  enableBackToTop?: boolean;
  /**
   * Set false when rendering this feed outside of a React Navigation Screen (e.g. inside a bottom sheet/tab view).
   * Prevents screen-only hooks (useIsFocused/useScrollToTop) from running.
   */
  insideNavigatorScreen?: boolean;
}

interface FeedItem extends GetNFTsResult {
  __listKey: string;
}

type InfiniteFeedInternalProps = Omit<InfiniteFeedProps, "insideNavigatorScreen">;

const InfiniteFeedBase: React.FC<
  InfiniteFeedInternalProps & {
    isFocused?: boolean;
    listRef: React.RefObject<FlatList<FeedItem> | null>;
    navigationForTabPress?: {
      addListener: (event: string, callback: () => void) => () => void;
      isFocused?: () => boolean;
    } | null;
  }
> = ({
  params,
  pageSize = 20,
  contentContainerStyle,
  headerComponent,
  onEndReachedAll,
  renderItem,
  keyExtractor,
  emptyComponent,
  fetchPage,
  scrollEnabled,
  onScroll,
  enableBackToTop = true,
  isFocused,
  listRef,
  navigationForTabPress = null,
}) => {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const endReachedRef = useRef(false);
  const prevYRef = useRef(0);

  const renderFeedItem = useCallback<ListRenderItem<FeedItem>>(
    (info) => renderItem(info as unknown as { item: GetNFTsResult; index: number; separators: any }),
    [renderItem]
  );

  const mapWithKey = useCallback((arr: GetNFTsResult[], pageNum: number) => {
    return (arr || []).map((it, idx) => {
      const base = (it as any).tokenId || (it as any).id || (it as any).nftId || `auto`;
      const created = (it as any).createdAt || (it as any).created_at || `nocreated`;
      return { ...(it as any), __listKey: `${base}-${created}-p${pageNum}-i${idx}` } as FeedItem;
    });
  }, []);

  const loadFirstPage = useCallback(async () => {
    setError(null);
    endReachedRef.current = false;
    setPage(0);
    const res = fetchPage
      ? await fetchPage(0, pageSize)
      : await getFeedNFTs({ ...(params || {}), unit: pageSize, page: 0, postType: (params as any)?.postType || "feed-all" });
    const mapped = mapWithKey(res.result || [], 0);
    setItems(mapped);
    if (!res.result || (res.result as any[]).length < pageSize) {
      endReachedRef.current = true;
      onEndReachedAll && onEndReachedAll();
    }
  }, [params, pageSize, onEndReachedAll, mapWithKey, fetchPage]);

  const resetAndLoad = useCallback(async () => {
    setItems([]);
    setInitialLoading(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load feed");
    } finally {
      setInitialLoading(false);
    }
  }, [loadFirstPage]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (initialLoading || loadingMore || refreshing) return;
    if (endReachedRef.current) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = fetchPage
        ? await fetchPage(nextPage, pageSize)
        : await getFeedNFTs({ ...(params || {}), unit: pageSize, page: nextPage, postType: (params as any)?.postType || "feed-all" });
      const newItems = mapWithKey(res.result || [], nextPage);
      setItems(prev => [...prev, ...newItems]);
      setPage(nextPage);
      if (newItems.length < pageSize) {
        endReachedRef.current = true;
        onEndReachedAll && onEndReachedAll();
      }
    } catch {
      // keep previous items
    } finally {
      setLoadingMore(false);
    }
  }, [initialLoading, loadingMore, refreshing, page, params, pageSize, onEndReachedAll, mapWithKey, fetchPage]);

  const onRefresh = useCallback(async () => {
    // Keep existing items so the RefreshControl spinner is visible (no skeleton snap).
    setRefreshing(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load feed");
    } finally {
      setRefreshing(false);
    }
  }, [loadFirstPage]);

  useEffect(() => {
    if (!navigationForTabPress) return;

    const unsubscribe = navigationForTabPress.addListener("tabPress", () => {
      // If isFocused was provided (screen mode), respect it.
      // Otherwise (embedded mode), fall back to navigation.isFocused() when available.
      const actuallyFocused =
        typeof isFocused === "boolean"
          ? isFocused
          : typeof navigationForTabPress.isFocused === "function"
            ? navigationForTabPress.isFocused()
            : true;

      if (!actuallyFocused) return;
      onRefresh();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigationForTabPress, isFocused, onRefresh, listRef]);

  const _keyExtractor = useCallback((item: FeedItem, index: number) => item.__listKey, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enableBackToTop) return;
      const y = e.nativeEvent.contentOffset.y;
      if (y > 400 && !showBackToTop) setShowBackToTop(true);
      else if (y <= 400 && showBackToTop) setShowBackToTop(false);
      prevYRef.current = y;
    },
    [enableBackToTop, showBackToTop]
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  if (initialLoading && items.length === 0) {
    return (
      <View className="flex-1 px-2 pt-2">
        <FeedCardSkeleton count={4} />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <View className="px-5 py-2 rounded-full bg-theme-neutrals-700">
          <Text onPress={resetAndLoad} className="text-theme-neutrals-50 font-medium">Retry</Text>
        </View>
      </View>
    );
  }

  if (!initialLoading && !error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        {emptyComponent ?? (
          <Text className="text-theme-neutrals-400 text-sm">No posts yet.</Text>
        )}
      </View>
    );
  }

  return (
    <View className="flex-1">
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor || _keyExtractor}
        renderItem={renderFeedItem}
        ListHeaderComponent={headerComponent as any}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === "android" ? false : true}
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || { paddingBottom: 80 }
        }
        scrollEnabled={scrollEnabled}
        onScroll={onScroll ?? (enableBackToTop ? handleScroll : undefined)}
        scrollEventThrottle={16}
        onEndReached={endReachedRef.current ? undefined : loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentForeground}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="px-2 pt-2">
              <FeedCardSkeleton count={2} />
            </View>
          ) : endReachedRef.current && items.length > 0 ? (
            <View className="px-4 py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">No more posts</Text>
            </View>
          ) : null
        }
      />
      {enableBackToTop && showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          className="absolute bottom-6 right-5 bg-theme-neutrals-800/80 rounded-full p-3 active:opacity-80"
        >
          <Ionicons
            name="chevron-up"
            size={22}
            color={theme.colors.accentForeground || "#fff"}
          />
        </Pressable>
      )}
    </View>
  );
};

const InfiniteFeedScreen: React.FC<InfiniteFeedInternalProps> = (props) => {
  const internalRef = useRef<FlatList<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlatList<FeedItem> | null> | undefined) ?? internalRef;
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  useScrollToTop(listRef);
  return <InfiniteFeedBase {...props} listRef={listRef} isFocused={isFocused} navigationForTabPress={navigation} />;
};

const InfiniteFeedEmbedded: React.FC<InfiniteFeedInternalProps> = (props) => {
  const internalRef = useRef<FlatList<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlatList<FeedItem> | null> | undefined) ?? internalRef;
  return <InfiniteFeedBase {...props} listRef={listRef} />;
};

export const InfiniteFeed: React.FC<InfiniteFeedProps> = ({ insideNavigatorScreen = true, ...rest }) => {
  return insideNavigatorScreen ? <InfiniteFeedScreen {...rest} /> : <InfiniteFeedEmbedded {...rest} />;
};

export default InfiniteFeed;
