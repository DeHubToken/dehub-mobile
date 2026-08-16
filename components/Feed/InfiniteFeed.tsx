import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ViewToken,
} from "react-native";
import Animated from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { getFeedNFTs, type GetNFTsResult, type GetNFTsResponse, type SearchParams } from "../../services";
import FeedCardSkeleton from "./FeedCardSkeleton";
import {
  createPostViewTracker,
  forceFlushBatchViews,
  type TokenId,
} from "../../services/view.service";
import { useFeedCardVisibility } from "../../hooks/useFeedCardVisibility";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

export type InfiniteFeedRenderItemInfo = {
  item: GetNFTsResult;
  index: number;
  separators: any;
  isVisible?: boolean;
};

export interface InfiniteFeedProps {
  /**
   * React Query cache identity for this feed. Required, and it must capture
   * everything `fetchPage` closes over: every caller supplies its own
   * `fetchPage`, so a shared or missing key would silently serve one profile's
   * posts to another. Give it stable, serialisable values
   * (e.g. `["profile-feed", address, postType]`).
   */
  cacheKey: readonly unknown[];
  params?: Partial<SearchParams>;
  pageSize?: number;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  onEndReachedAll?: () => void;
  renderItem: (info: InfiniteFeedRenderItemInfo) => React.ReactElement | null;
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
  /** Whether user is signed in (required for view tracking). */
  isSignedIn?: boolean;
  /** Optional custom loading component to replace the default skeleton. When provided, the headerComponent is preserved above this loading indicator. */
  loadingComponent?: React.ReactNode;
  /**
   * When true, only visible rows get isVisible=true (prevents many simultaneous
   * video players). Defaults to true: it used to default to false and no caller
   * ever passed it, so `isVisible` was never supplied and FeedCard fell back to
   * its own `true` default — every windowed row on every profile and community
   * feed attached a native player.
   */
  trackFeedCardVisibility?: boolean;
}

// Hoisted: a fresh object literal would re-configure the native scroll view on
// every render.
const MAINTAIN_POSITION = { minIndexForVisible: 1 } as const;

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
    isSignedIn?: boolean;
  }
> = ({
  cacheKey,
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
  isSignedIn = false,
  loadingComponent,
  trackFeedCardVisibility = true,
}) => {
  const {
    viewabilityConfig: feedCardViewabilityConfig,
    onViewableItemsChanged: onFeedCardViewableItemsChanged,
    isItemVisible,
    visibilityExtraData,
  } = useFeedCardVisibility();
  const [refreshing, setRefreshing] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const loadMoreCooldownRef = useRef(0);
  const prevYRef = useRef(0);

  // View tracking: map of tokenId -> tracker
  const viewTrackersRef = useRef<Map<string, ReturnType<typeof createPostViewTracker>>>(new Map());

  // Cleanup view trackers and flush batch on unmount
  useEffect(() => {
    return () => {
      viewTrackersRef.current.forEach(tracker => tracker.cleanup());
      viewTrackersRef.current.clear();
      forceFlushBatchViews();
    };
  }, []);

  // Get or create a view tracker for a token
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

  // Handle viewable items change for view tracking
  const onViewableItemsChanged = useRef(
    ({ changed }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      // No auth gate: signed-out viewers count too, and the view service routes
      // their views to the anonymous view backend.
      for (const entry of changed) {
        const item = entry.item as FeedItem | undefined;
        const tokenId = item?.tokenId || (item as any)?.id;
        if (!tokenId) continue;

        const tracker = getViewTracker(tokenId);
        tracker.onVisibilityChange(entry.isViewable ? 0.6 : 0);
      }
    },
  ).current;

  const handleViewableItemsChanged = useRef(
    (payload: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      if (trackFeedCardVisibility) {
        onFeedCardViewableItemsChanged(payload);
      }
      onViewableItemsChanged(payload);
    },
  ).current;

  const renderFeedItem = useCallback<ListRenderItem<FeedItem>>(
    (info) => {
      const payload: InfiniteFeedRenderItemInfo = {
        item: info.item,
        index: info.index,
        separators: info.separators,
      };
      if (trackFeedCardVisibility) {
        payload.isVisible = isItemVisible(info.item.__listKey, info.item);
      }
      return renderItem(payload as any);
    },
    [renderItem, trackFeedCardVisibility, isItemVisible],
  );

  // fetchPage and params are read through refs rather than closed over by the
  // query function, so a caller re-creating either does not invalidate the
  // cache. What identifies this feed is cacheKey, and nothing else.
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["infinite-feed", ...cacheKey, pageSize], [cacheKey, pageSize]);

  // Was a local useState list with manual page counting, so every mount
  // refetched from zero behind a skeleton — which is why profile and community
  // feeds felt slower than Home even though they render the same cards.
  const {
    data,
    error: queryError,
    isLoading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => {
      const page = pageParam as number;
      const fetcher = fetchPageRef.current;
      if (fetcher) return fetcher(page, pageSize);
      const p = paramsRef.current || {};
      return getFeedNFTs({
        ...p,
        unit: pageSize,
        page,
        postType: (p as any)?.postType,
      });
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPage.result?.length ?? 0) < pageSize ? undefined : (lastPageParam as number) + 1,
  });

  const items = useMemo<FeedItem[]>(() => {
    const pages = data?.pages ?? [];
    return pages.flatMap((res, pageNum) =>
      (res.result || []).map((it, idx) => {
        const base = (it as any).tokenId || (it as any).id || (it as any).nftId || `auto`;
        const created = (it as any).createdAt || (it as any).created_at || `nocreated`;
        return { ...(it as any), __listKey: `${base}-${created}-p${pageNum}-i${idx}` } as FeedItem;
      }),
    );
  }, [data]);

  const endReached = hasNextPage === false;
  const initialLoading = isLoading;
  const error = queryError ? (queryError as Error).message || "Failed to load feed" : null;

  useEffect(() => {
    if (endReached) onEndReachedAll?.();
  }, [endReached, onEndReachedAll]);

  const loadMore = useCallback(() => {
    if (isLoading || loadingMore || refreshing || !hasNextPage) return;
    // After a failed page fetch (e.g. 429 throttling) an unguarded
    // onEndReached would re-request the same page on every scroll frame and
    // amplify the rate limit. Back off before allowing another attempt.
    if (Date.now() < loadMoreCooldownRef.current) return;
    fetchNextPage().catch(() => {
      loadMoreCooldownRef.current = Date.now() + 5000;
    });
  }, [isLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    // Keep existing items so the RefreshControl spinner is visible (no skeleton snap).
    setRefreshing(true);
    loadMoreCooldownRef.current = 0;
    try {
      // Drop everything past the first page before refetching. React Query
      // refetches every loaded page of an infinite query, so without this a
      // pull-to-refresh twenty pages deep fires twenty sequential requests.
      queryClient.setQueryData(queryKey, (old: any) =>
        old?.pages?.length > 1
          ? { ...old, pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
          : old,
      );
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient, queryKey, refetch]);

  const retry = useCallback(() => {
    refetch();
  }, [refetch]);

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

  const isLoadingEmpty = initialLoading && items.length === 0;
  const isEmpty = !initialLoading && !error && items.length === 0;

  // One FlatList for every state so onViewableItemsChanged never flips between
  // defined/undefined on the same instance (RN invariant violation).
  const composedListHeader = useMemo(() => {
    const sections: React.ReactNode[] = [];
    if (headerComponent) {
      sections.push(<View key="feed-header">{headerComponent}</View>);
    }
    if (isLoadingEmpty) {
      sections.push(
        loadingComponent ?? (
          <View key="feed-loading" className="px-2 pt-2">
            <FeedCardSkeleton count={4} />
          </View>
        ),
      );
    } else if (error && items.length === 0) {
      sections.push(
        <View key="feed-error" className="items-center justify-center px-4 py-10">
          <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
          <View className="px-5 py-2 rounded-xl bg-theme-neutrals-700">
            <Text onPress={retry} className="text-theme-neutrals-50 font-medium">
              Retry
            </Text>
          </View>
        </View>,
      );
    } else if (isEmpty) {
      sections.push(
        <View key="feed-empty" className="items-center justify-center px-6 py-10">
          {emptyComponent ?? (
            <Text className="text-theme-neutrals-400 text-sm">No posts yet.</Text>
          )}
        </View>,
      );
    }
    if (sections.length === 0) return undefined;
    return <>{sections}</>;
  }, [
    headerComponent,
    isLoadingEmpty,
    isEmpty,
    error,
    items.length,
    loadingComponent,
    emptyComponent,
    retry,
  ]);

  return (
    <View className="flex-1">
      <Animated.FlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor || _keyExtractor}
        renderItem={renderFeedItem}
        ListHeaderComponent={composedListHeader}
        // See InfiniteVideoFeed: anchors the scroll to the first visible row so
        // a card that measures differently after its media decodes, or a header
        // that grows once its data lands, adjusts contentOffset instead of
        // shoving whatever the user was reading.
        maintainVisibleContentPosition={MAINTAIN_POSITION}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        // Was disabled on Android — the platform that actually OOMs here —
        // because visibility tracking was dead and every row held a player.
        // With trackFeedCardVisibility on by default that pressure is gone, and
        // this now matches the Home feeds, which clip on both platforms.
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || { paddingBottom: 80 }
        }
        scrollEnabled={scrollEnabled ?? true}
        onScroll={onScroll ?? (enableBackToTop ? handleScroll : undefined)}
        scrollEventThrottle={16}
        nestedScrollEnabled
        onEndReached={endReached ? undefined : loadMore}
        // Was 0.4 — the next page was only requested when the user was already
        // within half a screen of the end, so they routinely hit the bottom and
        // watched the skeleton footer appear. A full screen of runway means the
        // page is usually appended before it is ever scrolled to.
        onEndReachedThreshold={1.2}
        viewabilityConfig={feedCardViewabilityConfig}
        onViewableItemsChanged={handleViewableItemsChanged}
        extraData={trackFeedCardVisibility ? visibilityExtraData : undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="px-2 pt-2">
              <FeedCardSkeleton count={2} />
            </View>
          ) : endReached && items.length > 0 ? (
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
            color={theme.colors.accent}
          />
        </Pressable>
      )}
    </View>
  );
};

const InfiniteFeedScreen: React.FC<InfiniteFeedInternalProps & { isSignedIn?: boolean }> = (props) => {
  const internalRef = useRef<FlatList<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlatList<FeedItem> | null> | undefined) ?? internalRef;
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  useScrollToTop(listRef);
  return <InfiniteFeedBase {...props} listRef={listRef} isFocused={isFocused} navigationForTabPress={navigation} isSignedIn={props.isSignedIn} />;
};

const InfiniteFeedEmbedded: React.FC<InfiniteFeedInternalProps & { isSignedIn?: boolean }> = (props) => {
  const internalRef = useRef<FlatList<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlatList<FeedItem> | null> | undefined) ?? internalRef;
  return <InfiniteFeedBase {...props} listRef={listRef} isSignedIn={props.isSignedIn} />;
};

export const InfiniteFeed: React.FC<InfiniteFeedProps> = ({ insideNavigatorScreen = true, ...rest }) => {
  return insideNavigatorScreen ? <InfiniteFeedScreen {...rest} /> : <InfiniteFeedEmbedded {...rest} />;
};

export default InfiniteFeed;
