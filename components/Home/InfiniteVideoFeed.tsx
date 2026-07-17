import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useIsFocused, useNavigation, useScrollToTop } from "@react-navigation/native";
import {
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ListRenderItem,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import EmptyFeedState from "./EmptyFeedState";
import FeedCard from "./FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import Icon from "../ui/Icon";
import { useAuthState } from "../../context/AuthContext";
import {
  getUnifiedFeed,
  UnifiedFeedItem,
  UnifiedFeedParams,
  isVideoItem,
} from "../../services/feed.unified.service";
import { secondsToHMMSS } from "../../libs/date.util";
import {
  getAvatarUrl,
  resolveThumbnail,
  getImageUrl,
  getBadgeUrl,
} from "../../libs";
import { theme } from "../../theme";
import {
  createPostViewTracker,
  forceFlushBatchViews,
  type TokenId,
} from "../../services/view.service";
import { feedEvents } from "../../libs/eventBus";
import SuggestedAccountsSection from "./SuggestedAccountsSection";
import { useInfiniteQuery } from "@tanstack/react-query";

export interface InfiniteVideoFeedHandle {
  scrollToTopAndRefresh: () => void;
}

interface InfiniteVideoFeedProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  headerInset?: number;
  headerTranslateY?: SharedValue<number>;
  onEndReachedAll?: () => void;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onScrollBegin?: () => void;
  onCategorySelect?: (category: string) => void;
  feedRef?: React.MutableRefObject<InfiniteVideoFeedHandle | null>;
  /** Ref to the HomeScreen fling gesture so the suggestions carousel can claim horizontal pans. */
  suggestedPanRef?: React.MutableRefObject<any>;
}

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

export const InfiniteVideoFeed: React.FC<InfiniteVideoFeedProps> = ({
  params,
  pageSize = 10,
  contentContainerStyle,
  headerComponent,
  headerInset = 0,
  headerTranslateY,
  onEndReachedAll,
  onScrollOffset,
  onScrollEnd,
  onClearFilters,
  onRetry,
  onRefresh: onRefreshProp,
  onScrollBegin,
  onCategorySelect,
  feedRef,
  suggestedPanRef,
}) => {
  interface FeedItem extends UnifiedFeedItem {
    __listKey: string;
  }
  const [refreshing, setRefreshing] = useState(false);
  const [visibleItemKeys, setVisibleItemKeys] = useState<Set<string>>(new Set());
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const prevYRef = useRef(0);

  // Dynamic top spacer that shrinks/grows with header visibility
  const topSpacerStyle = useAnimatedStyle(() => ({
    height: Math.max(0, headerInset + (headerTranslateY?.value ?? 0)),
  }));

  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { isSignedIn } = useAuthState();

  // View tracking: map of tokenId -> tracker (for feed posts only, not videos)
  const viewTrackersRef = useRef<Map<string, ReturnType<typeof createPostViewTracker>>>(new Map());

  // Cleanup view trackers and flush batch on unmount
  useEffect(() => {
    return () => {
      viewTrackersRef.current.forEach(tracker => tracker.cleanup());
      viewTrackersRef.current.clear();
      forceFlushBatchViews();
    };
  }, []);

  // Get or create a view tracker for a feed post token
  const getViewTracker = useCallback((tokenId: TokenId) => {
    const key = String(tokenId);
    let tracker = viewTrackersRef.current.get(key);
    if (!tracker) {
      tracker = createPostViewTracker(tokenId, isSignedIn);
      viewTrackersRef.current.set(key, tracker);
    }
    return tracker;
  }, [isSignedIn]);

  // Viewability config: item is "viewable" when 50% visible
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 0, // We handle timing ourselves in the tracker
  }).current;

  // Handle viewable items change for view tracking (feed posts only)
  const onViewableItemsChanged = useRef(({ viewableItems, changed }: {
    viewableItems: ViewToken[];
    changed: ViewToken[];
  }) => {
    // Track visible items for audio preloading/pausing (works for all users)
    setVisibleItemKeys(prev => {
      let changed_membership = false;
      const next = new Set(prev);
      for (const entry of changed) {
        const key = (entry.item as FeedItem | undefined)?.__listKey;
        if (!key) continue;
        if (entry.isViewable) {
          if (!prev.has(key)) { next.add(key); changed_membership = true; }
        } else {
          if (prev.has(key)) { next.delete(key); changed_membership = true; }
        }
      }
      return changed_membership ? next : prev;
    });

    // Only the topmost visible item should autoplay — pick lowest index viewable item
    const topItem = viewableItems
      .filter(v => v.isViewable && (v.item as FeedItem | undefined)?.__listKey)
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
    setActiveVideoKey(topItem ? (topItem.item as FeedItem).__listKey : null);

    if (!isSignedIn) return;
    
    for (const entry of changed) {
      const item = entry.item as FeedItem | undefined;
      if (!item) continue;
      
      // Only track feed posts, not videos (videos have their own view tracking via playback)
      if (isVideoItem(item)) continue;
      
      const tokenId = item.tokenId || (item as any).id;
      if (!tokenId) continue;
      
      const tracker = getViewTracker(tokenId);
      // When FlatList says item is viewable (50%+ visible), report 0.6 visibility
      // When not viewable, report 0
      tracker.onVisibilityChange(entry.isViewable ? 0.6 : 0);
    }
  }).current;

  useScrollToTop(listRef);

  // Cached + revalidated by react-query: switching tabs re-renders instantly
  // from cache (no skeleton flash) and refetches in the background when stale,
  // matching the web app's seamless tab switching.
  const {
    data,
    error: queryError,
    isLoading: initialLoading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["home-feed", params ?? {}, pageSize],
    queryFn: ({ pageParam }) =>
      getUnifiedFeed({ ...(params || {}), limit: pageSize, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const results = lastPage.result || [];
      if (results.length < pageSize || !lastPage.pagination?.hasMore) return undefined;
      return lastPageParam + 1;
    },
  });

  const items = useMemo<FeedItem[]>(() => {
    const pages = data?.pages ?? [];
    return pages.flatMap((res, pageIdx) =>
      (res.result || []).map((it, idx) => {
        // Always include page + index to guarantee uniqueness even if backend returns duplicate ids
        const base =
          (it as any).tokenId ||
          (it as any).id ||
          (it as any).nftId ||
          (it as any).streamKey ||
          (it as any).stream?.id ||
          (it as any).stream?.streamKey ||
          `auto`; // fallback
        const created =
          (it as any).createdAt ||
          (it as any).stream?.createdAt ||
          (it as any).created_at ||
          `nocreated`;
        return {
          ...it,
          __listKey: `${base}-${created}-p${pageIdx + 1}-i${idx}`,
        };
      }),
    );
  }, [data]);

  const endReached = hasNextPage === false;
  const error = queryError ? (queryError as Error).message || "Failed to load" : null;

  useEffect(() => {
    if (endReached) onEndReachedAll?.();
  }, [endReached, onEndReachedAll]);

  const loadMore = useCallback(() => {
    if (initialLoading || loadingMore || refreshing || !hasNextPage) return;
    fetchNextPage().catch(() => {});
  }, [initialLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    // Call external refresh callback (e.g., to refresh shuffle seed)
    onRefreshProp?.();
    // Keep existing items so the RefreshControl spinner is visible (no skeleton snap).
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, onRefreshProp]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (!isFocused) return;
      // Tap active tab: start refresh immediately; spinner will be visible once we're near the top.
      onRefresh();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation, isFocused, onRefresh]);

  // Listen for feed refresh requests (e.g., after a new post is uploaded)
  useEffect(() => {
    return feedEvents.onRefreshRequested(() => {
      onRefresh();
    });
  }, [onRefresh]);

  const handleRetry = useCallback(() => {
    try { onRetry && onRetry(); } catch {}
    refetch();
  }, [onRetry, refetch]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const prevY = prevYRef.current;
      const delta = y - prevY;
      prevYRef.current = y;
      onScrollOffset?.(y, delta);
    },
    [onScrollOffset]
  );

  const handleScrollEndDrag = useCallback(() => {
    onScrollEnd?.();
  }, [onScrollEnd]);

  const handleMomentumScrollEnd = useCallback(() => {
    onScrollEnd?.();
  }, [onScrollEnd]);

  useEffect(() => {
    if (!feedRef) return;
    feedRef.current = {
      scrollToTopAndRefresh: () => {
        onRefresh();
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
    };
  }, [feedRef, onRefresh]);

  // Index after which to inject the suggested-accounts carousel (after the 5th post)
  const SUGGEST_AFTER_INDEX = 4;

  const renderItem = useCallback<ListRenderItem<FeedItem>>(
    ({ item, index }) => {
      const card = (
        <FeedCard
          item={item}
          onCategorySelect={onCategorySelect}
          isVisible={isFocused && (isVideoItem(item) ? item.__listKey === activeVideoKey : visibleItemKeys.has(item.__listKey))}
          enablePreview
        />
      );

      // Inject suggested accounts section after the 3rd feed item
      if (index === SUGGEST_AFTER_INDEX) {
        return (
          <>
            {card}
            <SuggestedAccountsSection panRef={suggestedPanRef} />
          </>
        );
      }

      return <>{card}</>;
    },
    [visibleItemKeys, activeVideoKey, isFocused, onCategorySelect],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.__listKey, []);

  // Handle scroll begin to close filter panel
  const handleScrollBeginDrag = useCallback(() => {
    onScrollBegin?.();
  }, [onScrollBegin]);

  // Handle touch start to close filter panel immediately
  const handleTouchStart = useCallback(() => {
    onScrollBegin?.();
  }, [onScrollBegin]);

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
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          className="px-5 py-2 rounded-xl bg-theme-neutrals-700 active:opacity-80"
        >
          <Text className="text-theme-neutrals-50 font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1" onTouchStart={handleTouchStart}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={
          <Animated.View>
            <Animated.View style={topSpacerStyle} />
            {headerComponent as any}
          </Animated.View>
        }
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || {
            paddingHorizontal: 8,
            paddingTop: 4,
            paddingBottom: 80,
          }
        }
        onEndReached={endReached ? undefined : loadMore}
        onEndReachedThreshold={0.8}
        extraData={[visibleItemKeys, activeVideoKey]}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        scrollEventThrottle={16}
        // View tracking for feed posts (not videos)
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
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
            <View className="px-4 py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">
                No more content
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading && !error ? (
            <EmptyFeedState
              message="No content matches your filters"
              onClear={onClearFilters}
              clearLabel="Clear Filters"
            />
          ) : null
        }
      />
    </View>
  );
};

export default InfiniteVideoFeed;
