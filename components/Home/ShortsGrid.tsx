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

export interface ShortsGridHandle {
  scrollToTopAndRefresh: () => void;
}

interface ShortsGridProps {
  params?: Partial<ShortsFeedParams>;
  pageSize?: number;
  gridRef?: React.MutableRefObject<ShortsGridHandle | null>;
  headerInset?: number;
  headerTranslateY?: SharedValue<number>;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onScrollBegin?: () => void;
  onRefresh?: () => void;
}

const ROW_HEIGHT = CARD_HEIGHT + GRID_GAP;

const ShortsGrid: React.FC<ShortsGridProps> = ({
  params,
  pageSize = 20,
  gridRef,
  headerInset = 0,
  headerTranslateY,
  onScrollOffset,
  onScrollEnd,
  onScrollBegin,
  onRefresh: onRefreshProp,
}) => {
  const [items, setItems] = useState<UnifiedFeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endReachedRef = useRef(false);
  const shuffleSeedRef = useRef<string | undefined>(undefined);
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

  const loadFirstPage = useCallback(async () => {
    setError(null);
    endReachedRef.current = false;
    shuffleSeedRef.current = undefined;
    setPage(1);
    const res = await getShortsFeed({ ...mergedParams, limit: pageSize, page: 1 });
    if (res.shuffleSeed) shuffleSeedRef.current = res.shuffleSeed;
    setItems(res.result || []);
    if (!res.result || res.result.length < pageSize || !res.pagination?.hasMore) {
      endReachedRef.current = true;
    }
  }, [mergedParams, pageSize]);

  const resetAndLoad = useCallback(async () => {
    setItems([]);
    setInitialLoading(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setInitialLoading(false);
    }
  }, [loadFirstPage]);

  useEffect(() => {
    resetAndLoad();
  }, [resetAndLoad]);

  const loadMore = useCallback(async () => {
    if (initialLoading || loadingMore || refreshing || endReachedRef.current) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await getShortsFeed({
        ...mergedParams,
        limit: pageSize,
        page: nextPage,
        shuffleSeed: shuffleSeedRef.current,
      });
      const newItems = res.result || [];
      if (res.shuffleSeed && !shuffleSeedRef.current) {
        shuffleSeedRef.current = res.shuffleSeed;
      }
      setItems((prev) => [...prev, ...newItems]);
      setPage(nextPage);
      if (newItems.length < pageSize || !res.pagination?.hasMore) {
        endReachedRef.current = true;
      }
    } catch {
      // keep existing items
    } finally {
      setLoadingMore(false);
    }
  }, [initialLoading, loadingMore, refreshing, page, mergedParams, pageSize]);

  const onRefresh = useCallback(async () => {
    onRefreshProp?.();
    setRefreshing(true);
    try {
      await loadFirstPage();
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setRefreshing(false);
    }
  }, [loadFirstPage, onRefreshProp]);

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
      initialItems: items,
      feedParams: { ...mergedParams, shuffleSeed: shuffleSeedRef.current },
    });
  }, [items, mergedParams, navigation]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const indices = new Set(
      viewableItems
        .filter((v) => v.isViewable && v.index != null)
        .map((v) => v.index as number),
    );
    setVisibleIndices(indices);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedFeedItem; index: number }) => (
      <ShortsGridCard item={item} index={index} isVisible={visibleIndices.has(index)} onPress={handleItemPress} />
    ),
    [handleItemPress, visibleIndices],
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
        <Pressable onPress={resetAndLoad} className="px-5 py-2 rounded-xl bg-theme-neutrals-700">
          <Text className="text-theme-neutrals-50 font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2">
      <FlatList
        ref={listRef}
        data={items}
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
        onScroll={handleScroll}
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
          ) : endReachedRef.current && items.length > 0 ? (
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
