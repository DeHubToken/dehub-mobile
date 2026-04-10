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
import EmptyFeedState from "./EmptyFeedState";
import FeedCard from "./FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import Icon from "../ui/Icon";
import { useAuth } from "../../context/AuthContext";
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
import SuggestedAccountsSection from "./SuggestedAccountsSection";

export interface InfiniteVideoFeedHandle {
  scrollToTopAndRefresh: () => void;
}

interface InfiniteVideoFeedProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  headerInset?: number;
  onEndReachedAll?: () => void;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onScrollBegin?: () => void;
  onCategorySelect?: (category: string) => void;
  feedRef?: React.MutableRefObject<InfiniteVideoFeedHandle | null>;
}

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

export const InfiniteVideoFeed: React.FC<InfiniteVideoFeedProps> = ({
  params,
  pageSize = 10,
  contentContainerStyle,
  headerComponent,
  headerInset = 0,
  onEndReachedAll,
  onScrollOffset,
  onScrollEnd,
  onClearFilters,
  onRetry,
  onRefresh: onRefreshProp,
  onScrollBegin,
  onCategorySelect,
  feedRef,
}) => {
  interface FeedItem extends UnifiedFeedItem {
    __listKey: string;
  }
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  // Start as true so we don't briefly render the empty state before resetAndLoad sets loading
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleItemKeys, setVisibleItemKeys] = useState<Set<string>>(new Set());
  const endReachedRef = useRef(false);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const prevYRef = useRef(0);

  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { isSignedIn } = useAuth();

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
  const onViewableItemsChanged = useRef(({ changed }: { 
    viewableItems: ViewToken[]; 
    changed: ViewToken[]; 
  }) => {
    // Track visible items for audio preloading/pausing (works for all users)
    setVisibleItemKeys(prev => {
      const next = new Set(prev);
      for (const entry of changed) {
        const key = (entry.item as FeedItem | undefined)?.__listKey;
        if (!key) continue;
        if (entry.isViewable) next.add(key);
        else next.delete(key);
      }
      return next;
    });

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

  const loadFirstPage = useCallback(async () => {
    setError(null);
    endReachedRef.current = false;
    setPage(1);
    const res = await getUnifiedFeed({ ...(params || {}), limit: pageSize, page: 1 });
    const mapped: FeedItem[] = (res.result || []).map((it, idx) => {
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
        __listKey: `${base}-${created}-p1-i${idx}`,
      };
    });
    setItems(mapped);
    if (!res.result || res.result.length < pageSize || !res.pagination?.hasMore) {
      endReachedRef.current = true;
      onEndReachedAll && onEndReachedAll();
    }
  }, [params, pageSize, onEndReachedAll]);

  const resetAndLoad = useCallback(async () => {
    // Show skeleton immediately for initial load / param changes.
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
    if (initialLoading || loadingMore || refreshing) return;
    if (endReachedRef.current) return; // hard stop
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await getUnifiedFeed({
        ...(params || {}),
        limit: pageSize,
        page: nextPage,
      });
      const newItems = (res.result || []).map((it, idx) => {
        const base =
          (it as any).tokenId ||
          (it as any).id ||
          (it as any).nftId ||
          (it as any).streamKey ||
          (it as any).stream?.id ||
          (it as any).stream?.streamKey ||
          `auto`;
        const created =
          (it as any).createdAt ||
          (it as any).stream?.createdAt ||
          (it as any).created_at ||
          `nocreated`;
        return {
          ...it,
          __listKey: `${base}-${created}-p${nextPage}-i${idx}`,
        };
      });
      setItems((prev) => [...prev, ...newItems]);
      setPage(nextPage);
      if (newItems.length < pageSize || !res.pagination?.hasMore) {
        endReachedRef.current = true;
        onEndReachedAll && onEndReachedAll();
      }
    } catch (e) {
      // keep previous items; optionally set a load-more error state
    } finally {
      setLoadingMore(false);
    }
  }, [
    initialLoading,
    loadingMore,
    refreshing,
    page,
    params,
    pageSize,
    onEndReachedAll,
  ]);

  const onRefresh = useCallback(async () => {
    // Call external refresh callback (e.g., to refresh shuffle seed)
    onRefreshProp?.();
    // Keep existing items so the RefreshControl spinner is visible (no skeleton snap).
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
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (!isFocused) return;
      // Tap active tab: start refresh immediately; spinner will be visible once we're near the top.
      onRefresh();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation, isFocused, onRefresh]);

  const handleRetry = useCallback(() => {
    try { onRetry && onRetry(); } catch {}
    resetAndLoad();
  }, [onRetry, resetAndLoad]);

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

  const renderItem: ListRenderItem<FeedItem> = ({ item, index }) => {
    const card = (
      <FeedCard
        item={item}
        onCategorySelect={onCategorySelect}
        isVisible={visibleItemKeys.has(item.__listKey)}
        enablePreview
      />
    );

    // Inject suggested accounts section after the 3rd feed item
    if (index === SUGGEST_AFTER_INDEX) {
      return (
        <>
          {card}
          <SuggestedAccountsSection />
        </>
      );
    }

    return <>{card}</>;
  };

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
          className="px-5 py-2 rounded-full bg-theme-neutrals-700 active:opacity-80"
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
        ListHeaderComponent={headerComponent as any}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || {
            paddingHorizontal: 8,
            paddingTop: headerInset + 4,
            paddingBottom: 80,
          }
        }
        onEndReached={endReachedRef.current ? undefined : loadMore}
        onEndReachedThreshold={0.8}
        extraData={visibleItemKeys}
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
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : endReachedRef.current && items.length > 0 ? (
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
