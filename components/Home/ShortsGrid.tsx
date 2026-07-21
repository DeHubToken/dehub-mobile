import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import ShortsGridCard, { CARD_HEIGHT, GRID_GAP } from "./ShortsGridCard";
import Icon from "../ui/Icon";
import { getShortsFeed } from "../../services/feed.unified.service";
import type { UnifiedFeedItem, ShortsFeedParams } from "../../services/feed.unified.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { theme } from "../../theme";
import { useInfiniteQuery } from "@tanstack/react-query";

export interface ShortsGridHandle {
  scrollToTopAndRefresh: () => void;
}

interface ShortsGridProps {
  params?: Partial<ShortsFeedParams>;
  pageSize?: number;
  /** False when this grid is a hidden (kept-mounted) tab — pauses preview videos. */
  active?: boolean;
  gridRef?: React.MutableRefObject<ShortsGridHandle | null>;
  headerInset?: number;
  headerTranslateY?: SharedValue<number>;
  /** Reanimated worklet scroll handler — when provided, scroll events stay on the UI thread. */
  scrollHandler?: any;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onScrollBegin?: () => void;
  onRefresh?: () => void;
}

// Animated wrapper so a worklet onScroll runs on the UI thread; cast keeps FlatList generics.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

const ROW_HEIGHT = CARD_HEIGHT + GRID_GAP;

const ShortsGrid: React.FC<ShortsGridProps> = ({
  params,
  pageSize = 20,
  active = true,
  gridRef,
  headerInset = 0,
  headerTranslateY,
  scrollHandler,
  onScrollOffset,
  onScrollEnd,
  onScrollBegin,
  onRefresh: onRefreshProp,
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList>(null);
  const prevYRef = useRef(0);

  // Dynamic top spacer that shrinks/grows with header visibility
  const topSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, headerInset + (headerTranslateY?.value ?? 0)),
  }));
  const navigation = useNavigation<any>();
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());

  useScrollToTop(listRef);

  const mergedParams = useMemo(() => ({
    ...(params || {}),
    sortBy: params?.sortBy || "createdAt" as const,
    sortOrder: params?.sortOrder || "desc" as const,
  }), [params]);

  // Cached + revalidated by react-query. The backend issues a shuffleSeed on
  // the first page; it rides along in the pageParam so later pages stay
  // consistent with the shuffle order.
  interface ShortsPageParam {
    page: number;
    shuffleSeed?: string;
  }

  const {
    data,
    error: queryError,
    isLoading: initialLoading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["home-shorts", mergedParams, pageSize],
    queryFn: ({ pageParam }: { pageParam: ShortsPageParam }) =>
      getShortsFeed({
        ...mergedParams,
        limit: pageSize,
        page: pageParam.page,
        shuffleSeed: pageParam.shuffleSeed,
      }),
    initialPageParam: { page: 1 } as ShortsPageParam,
    getNextPageParam: (lastPage, allPages, lastPageParam): ShortsPageParam | undefined => {
      const results = lastPage.result || [];
      if (results.length < pageSize || !lastPage.pagination?.hasMore) return undefined;
      return {
        page: lastPageParam.page + 1,
        shuffleSeed: allPages[0]?.shuffleSeed ?? lastPageParam.shuffleSeed,
      };
    },
  });

  const items = useMemo<UnifiedFeedItem[]>(
    () => (data?.pages ?? []).flatMap((res) => res.result || []),
    [data],
  );

  // Cards whose media can't load report themselves here so we drop them from the
  // grid — a broken/missing upload shouldn't render as a dead grey cell.
  const [unavailableKeys, setUnavailableKeys] = useState<Set<string>>(new Set());
  const markUnavailable = useCallback((key: string) => {
    setUnavailableKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const displayItems = useMemo(
    () => items.filter((it) => !unavailableKeys.has(String(it.tokenId ?? it.id))),
    [items, unavailableKeys],
  );

  const shuffleSeed = data?.pages?.[0]?.shuffleSeed;
  const endReached = hasNextPage === false;
  const error = queryError ? (queryError as Error).message || "Failed to load" : null;

  const loadMore = useCallback(() => {
    if (initialLoading || loadingMore || refreshing || !hasNextPage) return;
    fetchNextPage().catch(() => {});
  }, [initialLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    onRefreshProp?.();
    setRefreshing(true);
    setUnavailableKeys(new Set());
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, onRefreshProp]);

  useEffect(() => {
    if (!gridRef) return;
    gridRef.current = {
      scrollToTopAndRefresh: () => {
        onRefresh();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    };
  }, [gridRef, onRefresh]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const delta = y - prevYRef.current;
      prevYRef.current = y;
      onScrollOffset?.(y, delta);
    },
    [onScrollOffset],
  );

  const handleItemPress = useCallback((index: number) => {
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: index,
      initialItems: displayItems,
      feedParams: { ...mergedParams, shuffleSeed },
    });
  }, [displayItems, mergedParams, navigation, shuffleSeed]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const indices = new Set(
      viewableItems
        .filter((v) => v.isViewable && v.index != null)
        .map((v) => v.index as number),
    );
    // Bail when membership is unchanged so scroll frames don't trigger re-renders
    setVisibleIndices((prev) => {
      if (prev.size === indices.size) {
        let same = true;
        for (const i of indices) if (!prev.has(i)) { same = false; break; }
        if (same) return prev;
      }
      return indices;
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30, minimumViewTime: 150 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <ShortsGridCard
        item={item}
        index={index}
        isVisible={active && visibleIndices.has(index)}
        onPress={handleItemPress}
        onUnavailable={markUnavailable}
      />
    ),
    [handleItemPress, visibleIndices, markUnavailable, active],
  );

  const keyExtractor = useCallback(
    (item: UnifiedFeedItem) => String(item.tokenId ?? item.id ?? Math.random()),
    [],
  );

  const getItemLayout = useCallback((_data: any, index: number) => ({
    length: ROW_HEIGHT,
    offset: ROW_HEIGHT * Math.floor(index / 2),
    index,
  }), []);

  if (initialLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <Pressable onPress={() => refetch()} className="px-5 py-2 rounded-xl bg-theme-neutrals-700">
          <Text className="text-theme-neutrals-50 font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2">
      <AnimatedFlatList
        ref={listRef}
        data={displayItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        numColumns={2}
        columnWrapperStyle={{ gap: GRID_GAP }}
        ListHeaderComponent={<Animated.View style={topSpacerStyle} />}
        contentContainerStyle={{ paddingTop: 0, gap: GRID_GAP }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={9}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={0.8}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={scrollHandler ?? handleScroll}
        onScrollBeginDrag={onScrollBegin}
        onScrollEndDrag={onScrollEnd}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accentForeground}
            progressViewOffset={headerInset}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : endReached && items.length > 0 ? (
            <View className="py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">No more shorts</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading ? (
            <View className="flex-1 items-center justify-center py-20">
              <Icon name="Film" size={48} color="#555" />
              <Text className="text-theme-neutrals-400 text-sm mt-4">No shorts found</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

export default ShortsGrid;
