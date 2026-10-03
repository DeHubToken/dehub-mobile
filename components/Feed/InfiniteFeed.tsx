import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFeedPlaybackAllowed } from "../../libs/visualActivity";
import { useTranslation } from "react-i18next";
import { useIsFocused, useNavigation, useScrollToTop } from "@react-navigation/native";
import {
  View,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { FlashList, type FlashListRef, type ListRenderItem, type ViewToken } from "@shopify/flash-list";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "./DeHubRefreshControl";
import Animated from "react-native-reanimated";
import { feedRenderBudget } from "../../libs/feed-render-budget";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";
import { getFeedNFTs, type GetNFTsResult, type GetNFTsResponse, type SearchParams } from "../../services";
import FeedCardSkeleton from "./FeedCardSkeleton";
import {
  createPostViewTracker,
  forceFlushBatchViews,
  type TokenId,
} from "../../services/view.service";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { flattenFeedPages } from "../../libs/feed-pages";
import { mergeLiveCounts } from "../../libs/liveCounts";
import { isPostDeletedSync, useDeletedPostsVersion, warmDeletedPosts } from "../../libs/deleted-posts-store";
import { isLiveItem, isVideoItem } from "../../services/feed.unified.service";
import { resolveContentType } from "../Home/FeedCard";
import { useWatchedVideoIds, filterWatched } from "../../hooks/useWatchedVideos";
import { tabPressIntentOf } from "../../navigation/tabPressIntent";
import { createFeedVisibilityStore, useRowVisibility, type FeedVisibilityStore } from "../../libs/feedVisibility";

export type InfiniteFeedRenderItemInfo = {
  item: GetNFTsResult;
  index: number;
  separators: any;
  isVisible?: boolean;
  isAutoplayActive?: boolean;
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
  /**
   * Optional external ref for driving scroll (e.g. bottom sheet collapse-to-top).
   * It holds a FlashList; callers only use scrollToOffset, which both lists have.
   */
  listRef?: React.RefObject<any>;
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

// Hoisted: a fresh object literal would re-configure the list on every render.
// FlashList anchors on the first visible row, as FlatList's minIndexForVisible: 1
// did (child 0 there was the header), so a header that grows once its data
// lands, or a card that measures differently after its media decodes, moves the
// offset instead of the post being read. The threshold keeps a reader who is
// at the very top pinned there while the header settles.
const MAINTAIN_POSITION = { autoscrollToTopThreshold: 100 } as const;

// Same viewability rule the FlatList version used (useFeedCardVisibility):
// half the row on screen, held for 150ms, so a fling does not tick every frame.
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 50, minimumViewTime: 150 } as const;

// Cells kept for reuse across all item types (see InfiniteVideoFeed).
const MAX_POOLED_CELLS = 10;

interface FeedItem extends GetNFTsResult {
  __listKey: string;
}

// Reanimated's wrapper, created once at module scope so the list type is stable
// across renders (a wrapper made during render remounts the list every time).
// It attaches a worklet onScroll through FlashList's scrollable node, so the
// profile sheet's useAnimatedScrollHandler keeps working.
const AnimatedFlashList = Animated.createAnimatedComponent(
  FlashList as unknown as React.ComponentType<any>,
) as unknown as typeof FlashList;

/**
 * The row's key: the post id flattenFeedPages de-duplicates on, so it is unique
 * and survives a page shift (the __listKey folds in page and index). A cell and
 * its measured height follow the post. Rows with no id keep their __listKey.
 */
export function feedPostKey(item: FeedItem): string {
  const it = item as any;
  const id = it.tokenId ?? it.id ?? it.stream?.tokenId ?? it.streamKey ?? it.stream?.id;
  return id != null ? `post-${id}` : item.__listKey;
}

/** A cell is only reused for a row of the same media shape. */
export function feedPostType(item: FeedItem): string {
  const type = resolveContentType(item as any);
  if (type === "short") return "video";
  if (type !== "image") return type;
  const it = item as any;
  const n = Array.isArray(it.imageUrls) && it.imageUrls.length > 0 ? it.imageUrls.length : it.imageUrl || it.thumbnailUrl ? 1 : 0;
  return n > 1 ? "gallery" : n === 1 ? "image" : "text";
}

const VisibleFeedRow = memo(function VisibleFeedRow({ info, rowKey, store, renderItem }: {
  info: InfiniteFeedRenderItemInfo;
  rowKey: string;
  store: FeedVisibilityStore;
  renderItem: InfiniteFeedProps['renderItem'];
}) {
  const { isVisible, isAutoplay } = useRowVisibility(store, rowKey);
  return renderItem({ ...info, isVisible, isAutoplayActive: isAutoplay });
});

type InfiniteFeedInternalProps = Omit<InfiniteFeedProps, "insideNavigatorScreen">;

const InfiniteFeedBase: React.FC<
  InfiniteFeedInternalProps & {
    isFocused?: boolean;
    listRef: React.RefObject<FlashListRef<FeedItem> | null>;
    navigationForTabPress?: {
      addListener: (event: string, callback: (payload: unknown) => void) => () => void;
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
  const { t } = useTranslation();
  const visibilityStore = useMemo(() => createFeedVisibilityStore(isFocused ?? true), []);
  const playbackAllowed = useFeedPlaybackAllowed();
  useEffect(() => {
    visibilityStore.setLive((isFocused ?? true) && playbackAllowed);
  }, [visibilityStore, isFocused, playbackAllowed]);
  // One key for the list, the row's visibility subscription and the
  // viewability handler, so all three always agree on which row is which.
  const rowKeyOf = useCallback(
    (item: FeedItem, index: number) => (keyExtractor ? keyExtractor(item, index) : feedPostKey(item)),
    [keyExtractor],
  );
  const rowKeyOfRef = useRef(rowKeyOf);
  rowKeyOfRef.current = rowKeyOf;
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

  const getViewTrackerRef = useRef(getViewTracker);
  getViewTrackerRef.current = getViewTracker;
  const trackVisibilityRef = useRef(trackFeedCardVisibility);
  trackVisibilityRef.current = trackFeedCardVisibility;
  // Posts the last tick counted as on screen, for the view tracker's diff.
  const visibleTokensRef = useRef<Map<string, TokenId>>(new Map());

  // Visibility, autoplay and view tracking, rebuilt from the full visible set
  // on every tick. FlashList compares viewability by index and never resets it
  // when the data changes, so patching from `changed` (as the FlatList version
  // did) would miss a row that replaced another at the same index. The list is
  // also asked for a fresh tick whenever the rows change (see below).
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<FeedItem>[]; changed: ViewToken<FeedItem>[] }) => {
      // A card that renders nothing (a post deleted in place) is a 0px row,
      // which FlashList counts as fully viewable where FlatList never did. Left
      // in, it took the autoplay slot from the video under it.
      const hasHeight = (v: ViewToken<FeedItem>) =>
        v.index == null || (listRef.current?.getLayout(v.index)?.height ?? 1) > 0;
      const shown = viewableItems.filter((v) => v.isViewable && !!v.item && hasHeight(v));
      const keyOf = (v: ViewToken<FeedItem>) => rowKeyOfRef.current(v.item, v.index ?? 0);

      if (trackVisibilityRef.current) {
        // Autoplay belongs to the topmost row that can hold a player, and a
        // live row outranks a video row for it (see useFeedCardVisibility).
        const playable = shown.filter((v) => isVideoItem(v.item as any) || isLiveItem(v.item as any));
        const byPosition = (a: ViewToken<FeedItem>, b: ViewToken<FeedItem>) => (a.index ?? 0) - (b.index ?? 0);
        const top =
          playable.filter((v) => isLiveItem(v.item as any)).sort(byPosition)[0] ??
          playable.sort(byPosition)[0];
        visibilityStore.update(new Set(shown.map(keyOf)), top ? keyOf(top) : null);
      }

      // No auth gate: signed-out viewers count too, and the view service routes
      // their views to the anonymous view backend. A post reports 0.6 on the
      // tick it arrives and 0 on the tick it leaves.
      const next = new Map<string, TokenId>();
      for (const v of shown) {
        const tokenId = v.item.tokenId || (v.item as any).id;
        if (tokenId) next.set(String(tokenId), tokenId);
      }
      const prev = visibleTokensRef.current;
      prev.forEach((id, k) => { if (!next.has(k)) getViewTrackerRef.current(id).onVisibilityChange(0); });
      next.forEach((id, k) => { if (!prev.has(k)) getViewTrackerRef.current(id).onVisibilityChange(0.6); });
      visibleTokensRef.current = next;
    },
  ).current;

  const renderFeedItem = useCallback<ListRenderItem<FeedItem>>(
    (info) => {
      const payload: InfiniteFeedRenderItemInfo = {
        item: info.item,
        index: info.index,
        separators: undefined,
      };
      if (trackFeedCardVisibility) {
        return <VisibleFeedRow
          info={payload}
          rowKey={rowKeyOf(info.item, info.index)}
          store={visibilityStore}
          renderItem={renderItem}
        />;
      }
      return renderItem(payload as any);
    },
    [renderItem, trackFeedCardVisibility, rowKeyOf, visibilityStore],
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
    queryFn: async ({ pageParam }) => {
      const page = pageParam as number;
      const fetcher = fetchPageRef.current;
      const p = paramsRef.current || {};
      const response = await (fetcher ? fetcher(page, pageSize) : getFeedNFTs({
        ...p,
        unit: pageSize,
        page,
        postType: (p as any)?.postType,
      }));
      mergeLiveCounts(queryClient, response.result || []);
      return response;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      (lastPage.result?.length ?? 0) < pageSize ? undefined : (lastPageParam as number) + 1,
  });

  // Locally-deleted posts keep coming back from cached pages until a refetch;
  // the tombstone store exists for exactly this and was written but never read.
  const { watchedIds, hideWatched } = useWatchedVideoIds();

  const [tombstonesReady, setTombstonesReady] = useState(false);
  useEffect(() => {
    warmDeletedPosts().then(() => setTombstonesReady(true)).catch(() => {});
  }, []);

  // A post deleted from its card leaves the rows at once. The card only hides
  // itself, and with recycled cells that lasts until its cell is handed
  // another post: the deleted post then came back further down the scroll.
  const deletedVersion = useDeletedPostsVersion();

  const rawItems = useMemo<FeedItem[]>(
    () => flattenFeedPages<FeedItem>(data?.pages ?? [], isPostDeletedSync),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, tombstonesReady, deletedVersion],
  );

  // Videos already played, dropped only when the reader asked for that in
  // Settings. Kept as its own memo so the expensive flatMap above does not
  // re-run when the watch history refreshes.
  const items = useMemo<FeedItem[]>(
    () => filterWatched(rawItems, watchedIds, hideWatched),
    [rawItems, watchedIds, hideWatched],
  );

  // FlashList only reports rows whose index changed viewability, so a new
  // page, a refresh or a delete can leave the wrong card marked visible or
  // playing. Ask for a full tick whenever the rows change. An empty list
  // reports nothing at all, so the rows that were visible are let go here.
  useEffect(() => {
    if (items.length === 0) {
      handleViewableItemsChanged({ viewableItems: [], changed: [] });
      return;
    }
    try { listRef.current?.recomputeViewableItems(); } catch {}
  }, [items, handleViewableItemsChanged, listRef]);

  // How far past each edge FlashList renders: 1.5 screens, or 1 for
  // gallery-heavy feeds, exactly as Home computes it. Cells that leave are
  // reused, so this runway no longer has to be mounted card by card mid-fling.
  const { height: screenHeight } = useWindowDimensions();
  const renderBudget = useMemo(() => feedRenderBudget(items), [items]);
  const drawDistance = Math.round((screenHeight * (renderBudget.windowSize - 1)) / 4);

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

    const unsubscribe = navigationForTabPress.addListener("tabPress", (event: unknown) => {
      // If isFocused was provided (screen mode), respect it.
      // Otherwise (embedded mode), fall back to navigation.isFocused() when available.
      const actuallyFocused =
        typeof isFocused === "boolean"
          ? isFocused
          : typeof navigationForTabPress.isFocused === "function"
            ? navigationForTabPress.isFocused()
            : true;

      if (!actuallyFocused) return;
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      // First press on the focused tab is the cheap one — return to the top and
      // stop there. Only a repeat press refetches; see navigation/tabPressIntent.
      if (tabPressIntentOf(event) !== "refresh") return;
      onRefresh();
    });
    return unsubscribe;
  }, [navigationForTabPress, isFocused, onRefresh, listRef]);

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

  const hasItems = items.length > 0;
  const isLoadingEmpty = initialLoading && !hasItems;
  const isEmpty = !initialLoading && !error && !hasItems;

  // One list for every state so onViewableItemsChanged never flips between
  // defined/undefined on the same instance. Keyed on whether there are rows,
  // not on how many: a new page is not a new header, and a header element
  // that changes re-renders the whole profile header above the list.
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
    } else if (error && !hasItems) {
      sections.push(
        <View key="feed-error" className="items-center justify-center px-4 py-10">
          <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
          <View className="px-5 py-2 rounded-xl bg-theme-neutrals-700">
            <Text onPress={retry} className="text-theme-neutrals-50 font-medium">
              {t("common.retry")}
            </Text>
          </View>
        </View>,
      );
    } else if (isEmpty) {
      sections.push(
        <View key="feed-empty" className="items-center justify-center px-6 py-10">
          {emptyComponent ?? (
            <Text className="text-theme-neutrals-400 text-sm">{t("feed.noPostsYet")}</Text>
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
    hasItems,
    loadingComponent,
    emptyComponent,
    retry,
    t,
  ]);

  // Callers pass their style as an inline literal. Every new prop on the list
  // re-renders it, and under FlashList that re-measures every mounted cell, so
  // the style is held until its contents actually change.
  const contentStyleKey = JSON.stringify(contentContainerStyle ?? null);
  const listContentStyle = useMemo(
    () => contentContainerStyle || { paddingBottom: 80 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contentStyleKey],
  );

  const refreshControl = useMemo(
    () => (
      <DeHubRefreshControl
        refreshing={refreshing}
        onRefresh={onRefresh}
        tintColor={theme.colors.accent}
      />
    ),
    [refreshing, onRefresh],
  );

  // Match Home's fixed footer: removing two skeleton cards when a page
  // settles shrinks the list and clamps the reader's position.
  const listFooter = useMemo(
    () => (
      <View style={{ height: 84 }} className="items-center justify-center">
        {loadingMore ? (
          <DeHubLoader size={32} />
        ) : endReached && hasItems ? (
          <Text className="text-theme-neutrals-400 text-xs">{t("feed.noMorePosts")}</Text>
        ) : null}
      </View>
    ),
    [loadingMore, endReached, hasItems, t],
  );

  return (
    <View className="flex-1">
      {/* FlashList, as Home has been since #1419: a cell that scrolls off is
          handed the next post. Under FlatList every row mounted a whole new
          FeedCard as it entered the window and unmounted one as it left, in
          the middle of the fling. Only the rows rendered before the first
          scroll escaped that, so a long profile was smooth for its first
          screens and not past them. */}
      <AnimatedFlashList
        ref={listRef}
        showsVerticalScrollIndicator={false}
        data={items}
        keyExtractor={rowKeyOf}
        getItemType={feedPostType}
        renderItem={renderFeedItem}
        ListHeaderComponent={composedListHeader}
        maintainVisibleContentPosition={MAINTAIN_POSITION}
        // Replaces initialNumToRender/windowSize/maxToRenderPerBatch. No
        // removeClippedSubviews either: FlashList turns it off itself, which
        // its maintainVisibleContentPosition needs.
        drawDistance={drawDistance}
        maxItemsInRecyclePool={MAX_POOLED_CELLS}
        contentContainerStyle={listContentStyle}
        scrollEnabled={scrollEnabled ?? true}
        onScroll={onScroll ?? (enableBackToTop ? handleScroll : undefined)}
        // See InfiniteVideoFeed: 16 is below Android's 17ms throttle floor.
        scrollEventThrottle={24}
        nestedScrollEnabled
        onEndReached={endReached ? undefined : loadMore}
        // Keep multiple screens of runway. Fast flings can consume a single
        // screen before the request completes, leaving the gesture pinned at
        // the old content boundary.
        onEndReachedThreshold={2.5}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onViewableItemsChanged={handleViewableItemsChanged}
        refreshControl={refreshControl}
        ListFooterComponent={listFooter}
      />
      {enableBackToTop && showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel={t("profile.backToTop")}
          className="absolute bottom-6 right-5 bg-theme-neutrals-800/80 rounded-xl p-3 active:opacity-80"
        >
          <Ionicons
            name="chevron-up"
            size={22}
            color={theme.colors.accent}
          />
        </Pressable>
      )}
      <DeHubRefreshMark refreshing={refreshing} />
    </View>
  );
};

const InfiniteFeedScreen: React.FC<InfiniteFeedInternalProps & { isSignedIn?: boolean }> = (props) => {
  const internalRef = useRef<FlashListRef<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlashListRef<FeedItem> | null> | undefined) ?? internalRef;
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  useScrollToTop(listRef);
  return <InfiniteFeedBase {...props} listRef={listRef} isFocused={isFocused} navigationForTabPress={navigation} isSignedIn={props.isSignedIn} />;
};

const InfiniteFeedEmbedded: React.FC<InfiniteFeedInternalProps & { isSignedIn?: boolean }> = (props) => {
  const internalRef = useRef<FlashListRef<FeedItem>>(null);
  const listRef = (props.listRef as React.RefObject<FlashListRef<FeedItem> | null> | undefined) ?? internalRef;
  return <InfiniteFeedBase {...props} listRef={listRef} isSignedIn={props.isSignedIn} />;
};

export const InfiniteFeed: React.FC<InfiniteFeedProps> = ({ insideNavigatorScreen = true, ...rest }) => {
  return insideNavigatorScreen ? <InfiniteFeedScreen {...rest} /> : <InfiniteFeedEmbedded {...rest} />;
};

export default InfiniteFeed;
