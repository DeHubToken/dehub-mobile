import React, {
  memo,
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
import Animated from "react-native-reanimated";
import EmptyFeedState from "./EmptyFeedState";
import FeedCard from "./FeedCard";
import FeedCardSkeleton from "../Feed/FeedCardSkeleton";
import Icon from "../ui/Icon";
import { useTranslation } from "react-i18next";
import useNewPostsSignal from "../../hooks/useNewPostsSignal";
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
import { isPostDeletedSync, warmDeletedPosts } from "../../libs/deleted-posts-store";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import SuggestedAccountsSection from "./SuggestedAccountsSection";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";

export interface InfiniteVideoFeedHandle {
  scrollToTopAndRefresh: () => void;
}

interface InfiniteVideoFeedProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  /** False when this list is a hidden (kept-mounted) tab — pauses videos and tab-press refresh. */
  active?: boolean;
  contentContainerStyle?: any;
  headerComponent?: React.ReactNode;
  headerInset?: number;
  onEndReachedAll?: () => void;
  /** Reanimated worklet scroll handler — when provided, scroll events stay on the UI thread. */
  scrollHandler?: any;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onClearFilters?: () => void;
  onRetry?: () => void;
  onRefresh?: () => void;
  onScrollBegin?: () => void;
  onCategorySelect?: (category: string) => void;
  feedRef?: React.MutableRefObject<InfiniteVideoFeedHandle | null>;
}

// Reserved height for the footer so its three states are interchangeable
// without resizing the list. Sized to the large ActivityIndicator plus the
// padding the spinner block used to carry.
const FOOTER_SLOT = { height: 84 } as const;

// Hoisted: a fresh object literal here would re-configure the native scroll
// view on every render.
const MAINTAIN_POSITION = { minIndexForVisible: 1 } as const;

const DEFAULT_BANNER = require("../../assets/default-banner.png");
const DEFAULT_AVATAR = require("../../assets/default-avatar.png");

// Animated wrapper so a worklet onScroll runs on the UI thread; cast keeps FlatList generics.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

export const InfiniteVideoFeed: React.FC<InfiniteVideoFeedProps> = ({
  params,
  pageSize = 10,
  active = true,
  contentContainerStyle,
  headerComponent,
  headerInset = 0,
  onEndReachedAll,
  scrollHandler,
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
  const [refreshing, setRefreshing] = useState(false);
  const [visibleItemKeys, setVisibleItemKeys] = useState<Set<string>>(new Set());
  const [activeVideoKey, setActiveVideoKey] = useState<string | null>(null);
  const listRef = useRef<FlatList<FeedItem>>(null);
  const prevYRef = useRef(0);

  // Fixed-height top spacer.
  //
  // This used to be an animated height driven by `headerTranslateY`, which made
  // the list's own content box grow and shrink *while the user was scrolling*:
  //   - every frame of the 380ms header animation relaid out the whole content
  //     view (the scroll-time stutter), and
  //   - the content below shifted by up to `headerInset` px on top of the
  //     scroll itself, so a drag that reversed direction moved the feed at
  //     double speed and then stopped dead (the "jumps around" symptom).
  // The header is `position: absolute` over the pager (HomeScreen.styles
  // .headerClip), so it can slide away on its own without the list resizing —
  // and useCollapsibleHeader only hides it once scrollY has passed
  // `headerInset`, which keeps this spacer off-screen whenever it is gone.
  const topSpacerStyle = useMemo(() => ({ height: headerInset }), [headerInset]);

  const navigation = useNavigation<any>();
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();

  // View tracking: map of tokenId -> tracker (for feed posts only, not videos)
  const viewTrackersRef = useRef<Map<string, ReturnType<typeof createPostViewTracker>>>(new Map());

  // FlatList refuses a changing onViewableItemsChanged, so that handler is
  // frozen in a ref on first render — and it reaches getViewTracker, which
  // reads isSignedIn. Captured directly, that meant a session that signed in
  // without remounting the feed kept minting anonymous trackers for the rest of
  // its life. A ref is the only value the frozen handler can see change.
  const isSignedInRef = useRef(isSignedIn);
  useEffect(() => { isSignedInRef.current = isSignedIn; }, [isSignedIn]);

  // Signing in or out changes where a view is attributed, so trackers minted
  // under the old state are stale. Dropping them lets the next viewability tick
  // rebuild them; pending dwell time is flushed rather than silently binned.
  useEffect(() => {
    viewTrackersRef.current.forEach((tracker) => tracker.cleanup());
    viewTrackersRef.current.clear();
    forceFlushBatchViews();
  }, [isSignedIn]);

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
      tracker = createPostViewTracker(tokenId, isSignedInRef.current);
      viewTrackersRef.current.set(key, tracker);
    }
    return tracker;
  }, []);

  // Viewability config: item is "viewable" when 50% visible
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
    // Debounce viewability during flings so we don't setState (and re-render the
    // list) on every frame; the view tracker still measures dwell time itself.
    minimumViewTime: 150,
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

    // No auth gate: signed-out viewers count too, and the view service routes
    // their views to the anonymous view backend.
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
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["home-feed", params ?? {}, pageSize], [params, pageSize]);

  const {
    data,
    error: queryError,
    isLoading: initialLoading,
    isFetchingNextPage: loadingMore,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getUnifiedFeed({ ...(params || {}), limit: pageSize, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const results = lastPage.result || [];
      if (results.length < pageSize || !lastPage.pagination?.hasMore) return undefined;
      return lastPageParam + 1;
    },
  });

  // Locally-deleted posts keep coming back from cached pages until a refetch;
  // the tombstone store exists for exactly this and was written but never read.
  const [tombstonesReady, setTombstonesReady] = useState(false);
  useEffect(() => {
    warmDeletedPosts().then(() => setTombstonesReady(true)).catch(() => {});
  }, []);

  const items = useMemo<FeedItem[]>(() => {
    const pages = data?.pages ?? [];
    return pages
      .flatMap((res, pageIdx) =>
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
      )
      .filter((it: any) => {
        const id = it.tokenId ?? it.id ?? it.stream?.tokenId;
        return id == null || !isPostDeletedSync(id);
      });
  }, [data, tombstonesReady]);

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
      // Drop everything past the first page before refetching. React Query
      // refetches every loaded page of an infinite query, so without this a
      // pull-to-refresh deep into the feed fires one request per loaded page.
      queryClient.setQueryData(queryKey, (old: any) =>
        old?.pages?.length > 1
          ? { ...old, pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
          : old,
      );
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch, onRefreshProp, queryClient, queryKey]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress", () => {
      if (!isFocused || !active) return;
      // Tap active tab: start refresh immediately; spinner will be visible once we're near the top.
      onRefresh();
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return unsubscribe;
  }, [navigation, isFocused, active, onRefresh]);

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


  // "N new posts" — the chronological feed's only cue that the timeline moved
  // on. Only for the default createdAt sort: under the ranked sorts position
  // isn't time, so the pill would promise something the list can't honour.
  const newestRenderedCreatedAt = useMemo(() => {
    const first = data?.pages?.[0]?.result?.[0] as
      | { createdAt?: string; created_at?: string }
      | undefined;
    return first?.createdAt || first?.created_at || undefined;
  }, [data]);

  const { newPostCount, atCap: newPostsAtCap } = useNewPostsSignal({
    enabled: active && isFocused && (params?.sortBy ?? "createdAt") === "createdAt",
    params,
    newestCreatedAt: newestRenderedCreatedAt,
  });

  const showNewPosts = useCallback(() => {
    // onRefresh already drops every page past the first before refetching, so
    // this is the same work pull-to-refresh does, minus the gesture.
    void onRefresh();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [onRefresh]);
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
          isVisible={active && isFocused && (isVideoItem(item) ? item.__listKey === activeVideoKey : visibleItemKeys.has(item.__listKey))}
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
    },
    [visibleItemKeys, activeVideoKey, isFocused, active, onCategorySelect],
  );

  const keyExtractor = useCallback((item: FeedItem) => item.__listKey, []);

  // A fresh array literal here re-rendered every mounted cell on every list
  // render; this only changes identity when the visibility state actually does.
  const extraData = useMemo(
    () => ({ visibleItemKeys, activeVideoKey }),
    [visibleItemKeys, activeVideoKey],
  );

  // Inline JSX here was a fresh element on every render — including the two
  // renders per viewability change — so VirtualizedList re-rendered the header
  // cell (and re-measured it, moving every row below) mid-fling.
  const listHeader = useMemo(
    () => (
      <View>
        <View style={topSpacerStyle} />
        {headerComponent as any}
      </View>
    ),
    [topSpacerStyle, headerComponent],
  );

  // One fixed-height slot for all three footer states. Previously the footer
  // swapped between a spinner block, a text block and `null`, each a different
  // height — so the content size changed underneath a user who was, by
  // definition, sitting at the bottom of the list. Android clamps the scroll
  // offset when content shrinks, which showed up as a jump every time a page
  // finished loading.
  const listFooter = useMemo(
    () => (
      <View style={FOOTER_SLOT} className="items-center justify-center">
        {loadingMore ? (
          <ActivityIndicator size="large" color="#fff" />
        ) : endReached && items.length > 0 ? (
          <Text className="text-theme-neutrals-400 text-xs">No more content</Text>
        ) : null}
      </View>
    ),
    [loadingMore, endReached, items.length],
  );

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
      <View className="flex-1 px-2">
        {/* Pushed below the collapsible header. The early return drops the
            list's ListHeaderComponent, which is where the header spacer lives —
            without this the skeleton starts at y=0 and its first cards render
            behind the header, so the wait looks broken as well as slow. */}
        <View style={topSpacerStyle} />
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
      {newPostCount > 0 && (
        <View
          pointerEvents="box-none"
          style={{ position: "absolute", top: headerInset + 8, left: 0, right: 0, alignItems: "center", zIndex: 20 }}
        >
          <Pressable
            onPress={showNewPosts}
            accessibilityRole="button"
            accessibilityLabel={`${newPostCount} new posts, tap to refresh`}
            className="flex-row items-center gap-1.5 rounded-full border border-white/20 bg-black/85 px-4 py-2"
          >
            <Icon name="ArrowUp" size={14} color="#E5E7EB" />
            <Text className="text-xs font-semibold text-white">
              {t("feed.newPosts", { count: newPostCount })}
              {newPostsAtCap ? "+" : ""}
            </Text>
          </Pressable>
        </View>
      )}
      <AnimatedFlatList
        ref={listRef}
        data={items}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        // Anchors the scroll position to the first visible row, so anything that
        // changes size *above* the viewport adjusts contentOffset instead of
        // shoving the user. Three things in this feed do exactly that:
        // SuggestedAccountsSection renders null until its fetch resolves and
        // then expands inside cell 4; StoriesBar appearing grows the header and
        // therefore the top spacer; and a card can measure differently once its
        // thumbnail decodes. minIndexForVisible: 1 excludes the header cell, so
        // scroll-to-top and pull-to-refresh still behave normally.
        maintainVisibleContentPosition={MAINTAIN_POSITION}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews
        updateCellsBatchingPeriod={80}
        contentContainerStyle={
          contentContainerStyle || {
            paddingHorizontal: 8,
            paddingTop: 4,
            paddingBottom: TAB_BAR_CONTENT_INSET,
          }
        }
        onEndReached={endReached ? undefined : loadMore}
        onEndReachedThreshold={0.8}
        extraData={extraData}
        onScroll={scrollHandler ?? handleScroll}
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
            tintColor={theme.colors.accent}
            progressViewOffset={headerInset}
          />
        }
        ListFooterComponent={listFooter}
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

// Home keeps all six tab pages mounted, so without this every tab switch
// re-rendered five off-screen feeds along with the one the user asked for.
// HomeScreen holds every prop stable across a switch except `active`.
export default memo(InfiniteVideoFeed);
