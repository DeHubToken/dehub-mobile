import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import {
  View,
  FlatList,
  Text,
  Pressable,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
} from "react-native";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import Animated from "react-native-reanimated";
import { useIsFocused, useNavigation, useScrollToTop } from "@react-navigation/native";
import ShortsGridCard, { useShortsCardSize, GRID_GAP, shortsPosterUri } from "./ShortsGridCard";
import { brickShape, packBricks, type BrickRow } from "../../libs/shorts-bricks";
import { storedVideoAspect } from "../../libs/video-aspect";
import ShortsGridSkeleton from "./ShortsGridSkeleton";
import Icon from "../ui/Icon";
import { getShortsFeed } from "../../services/feed.unified.service";
import type { UnifiedFeedItem, ShortsFeedParams } from "../../services/feed.unified.service";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { theme } from "../../theme";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { flattenFeedPages } from "../../libs/feed-pages";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";

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
  /** Reanimated worklet scroll handler — when provided, scroll events stay on the UI thread. */
  scrollHandler?: any;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onScrollBegin?: () => void;
  onRefresh?: () => void;
}

/**
 * Which cell may autoplay right now. Held outside React state so starting or
 * stopping a scroll (which pauses autoplay) re-renders only the one cell that
 * was or will be playing, not renderItem for every mounted cell at the moment
 * the finger starts moving.
 */
function createPlayStore() {
  let current: number | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: number | null) {
      if (next === current) return;
      current = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
  };
}
type PlayStore = ReturnType<typeof createPlayStore>;

type Frame = { width: number; height: number; wide?: boolean; hero?: boolean; still?: boolean };

const GridCell = memo(function GridCell({ store, item, index, onPress, onUnavailable, frame }: {
  store: PlayStore;
  item: UnifiedFeedItem;
  index: number;
  onPress: (index: number) => void;
  onUnavailable: (key: string) => void;
  frame: Frame;
}) {
  const playing = useSyncExternalStore(store.subscribe, () => store.get() === index);
  return <ShortsGridCard item={item} index={index} isVisible={playing} onPress={onPress} onUnavailable={onUnavailable} frame={frame} />;
});

const itemKey = (item: UnifiedFeedItem) => String(item.tokenId ?? item.id);
const shapeOf = (item: UnifiedFeedItem) => brickShape(item.postType === "feed-images" ? undefined : storedVideoAspect(item.videoInfo));

/** The item a row offers for autoplay: its short, or its full-width video. */
function rowLead(row: BrickRow<UnifiedFeedItem>): UnifiedFeedItem {
  if (row.kind === "pair" || row.kind === "trio") return row.items[0];
  if (row.kind === "stack") return row.tall;
  return row.item;
}

// Animated wrapper so a worklet onScroll runs on the UI thread; cast keeps FlatList generics.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

const ShortsGrid: React.FC<ShortsGridProps> = ({
  params,
  pageSize = 20,
  active = true,
  gridRef,
  headerInset = 0,
  scrollHandler,
  onScrollOffset,
  onScrollEnd,
  onScrollBegin,
  onRefresh: onRefreshProp,
}) => {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const { isMinimal } = useAppTheme();
  const listRef = useRef<FlatList>(null);
  const prevYRef = useRef(0);
  // The Shorts viewer opens as a transparent modal, so Home stays mounted and
  // drawn under it. A grid tile left looping there redrew the window on
  // every one of its frames while the viewer was being swiped.
  const focused = useIsFocused();

  // Fixed height — see the note in InfiniteVideoFeed. Animating this resized the
  // list's content box on every frame of the header animation, which relaid out
  // the grid mid-scroll and shifted every row below it.
  const topSpacerStyle = useMemo(() => ({ height: headerInset }), [headerInset]);
  // Memoised so the header cell isn't a fresh element (and a fresh measurement)
  // on every list render.
  const listHeader = useMemo(() => <View style={topSpacerStyle} />, [topSpacerStyle]);
  const navigation = useNavigation<any>();
  // The one cell that autoplays. Every visible cell playing its full video
  // meant four to six concurrent streams per screen of grid; the rest show
  // their poster, and the viewer opens on tap anyway.
  const [playIndex, setPlayIndex] = useState<number | null>(null);
  const [scrolling, setScrolling] = useState(false);
  const beginScroll = useCallback(() => {
    setScrolling(true);
    onScrollBegin?.();
  }, [onScrollBegin]);
  const endScroll = useCallback(() => {
    setScrolling(false);
    onScrollEnd?.();
  }, [onScrollEnd]);

  useScrollToTop(listRef);

  // postType is forced rather than inherited from the active tab so this key is
  // identical whether the user sits on "All" or on Shorts. Without it the grid
  // mounts (via tab warm-up) under a postType-less key while HomeScreen
  // prefetches under `postType: "short"` (screens/HomeScreen.tsx:208), so boot
  // fires the same request twice and the warm-up is wasted. Mirrors the
  // existing correct pattern in HomeImageGrid.tsx:231.
  const mergedParams = useMemo(() => ({
    ...(params || {}),
    sortBy: params?.sortBy || "createdAt" as const,
    sortOrder: params?.sortOrder || "desc" as const,
    postType: "short" as const,
  }), [params]);

  // Cached + revalidated by react-query. The backend issues a shuffleSeed on
  // the first page; it rides along in the pageParam so later pages stay
  // consistent with the shuffle order.
  interface ShortsPageParam {
    page: number;
    shuffleSeed?: string;
  }

  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["home-shorts", mergedParams, pageSize],
    [mergedParams, pageSize],
  );

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
      if (!lastPage.pagination?.hasMore) return undefined;
      return {
        page: lastPageParam.page + 1,
        shuffleSeed: allPages[0]?.shuffleSeed ?? lastPageParam.shuffleSeed,
      };
    },
  });

  // Offset paging repeats rows across the page boundary; keep the first copy.
  const items = useMemo<UnifiedFeedItem[]>(
    () => flattenFeedPages<UnifiedFeedItem>(data?.pages ?? [], () => false),
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

  const shapeItems = displayItems;
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    shapeItems.forEach((it, i) => map.set(itemKey(it), i));
    return map;
  }, [shapeItems]);

  const shuffleSeed = data?.pages?.[0]?.shuffleSeed;
  const endReached = hasNextPage === false;

  // Brick rows: two shorts, a short beside up to three stacked wide clips, or
  // one wide video across the width. The tail waits for the next page so rows
  // already on screen never reshuffle.
  const rows = useMemo(
    () => packBricks(shapeItems, shapeOf, itemKey, endReached),
    [shapeItems, endReached],
  );
  const error = queryError ? (queryError as Error).message || t("copy.3d2301d732a7", { defaultValue: "Failed to load" }) : null;

  const loadMore = useCallback(() => {
    if (initialLoading || loadingMore || refreshing || !hasNextPage) return;
    fetchNextPage().catch(() => {});
  }, [initialLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    onRefreshProp?.();
    setRefreshing(true);
    setUnavailableKeys(new Set());
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

  const viewerData = useRef({ shapeItems, mergedParams, shuffleSeed });
  viewerData.current = { shapeItems, mergedParams, shuffleSeed };
  const handleItemPress = useCallback((index: number) => {
    const current = viewerData.current;
    navigation.navigate(ScreenNames.ShortsViewer, {
      initialIndex: index,
      initialItems: current.shapeItems,
      feedParams: { ...current.mergedParams, shuffleSeed: current.shuffleSeed },
    });
  }, [navigation]);

  const indexByIdRef = useRef(indexById);
  indexByIdRef.current = indexById;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    // Viewability here means (nearly) fully on screen, so the first such cell
    // in reading order is the one most in view.
    // Rows, not tiles: the first row fully in view plays its lead tile.
    let first: ViewToken | null = null;
    for (const v of viewableItems) {
      if (v.isViewable && v.index != null && (first === null || v.index < (first.index ?? Infinity))) first = v;
    }
    const lead = first ? rowLead(first.item as BrickRow<UnifiedFeedItem>) : null;
    // Same index bails out of the re-render on its own.
    setPlayIndex(lead ? indexByIdRef.current.get(itemKey(lead)) ?? null : null);
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80, minimumViewTime: 150 }).current;

  const [playStore] = useState(createPlayStore);
  useEffect(() => {
    playStore.set(active && focused && !scrolling ? playIndex : null);
  }, [playStore, active, focused, scrolling, playIndex]);

  // Fetch each new page's posters as soon as it arrives, so a tile is not
  // still downloading when it scrolls in (late tiles popped in, or sat black).
  const cardWidth = useShortsCardSize().width;
  const prefetched = useRef(new Set<string>());
  useEffect(() => {
    const urls: string[] = [];
    for (const it of shapeItems) {
      const uri = shortsPosterUri(it, cardWidth);
      if (uri && !prefetched.current.has(uri)) {
        prefetched.current.add(uri);
        urls.push(uri);
      }
    }
    if (urls.length) Image.prefetch(urls, "disk").catch(() => {});
  }, [shapeItems, cardWidth]);

  const tallHeight = cardWidth * (16 / 9);
  const fullWidth = cardWidth * 2 + GRID_GAP;
  const heroHeight = fullWidth * (9 / 16);

  const renderItem = useCallback(
    ({ item: row }: { item: BrickRow<UnifiedFeedItem> }) => {
      const cell = (it: UnifiedFeedItem, frame: Frame) => (
        <GridCell
          key={itemKey(it)}
          store={playStore}
          item={it}
          index={indexById.get(itemKey(it)) ?? 0}
          onPress={handleItemPress}
          onUnavailable={markUnavailable}
          frame={frame}
        />
      );
      if (row.kind === "hero") {
        return cell(row.item, { width: fullWidth, height: heroHeight, wide: true, hero: true });
      }
      if (row.kind === "pair") {
        return (
          <View style={{ flexDirection: "row", gap: GRID_GAP }}>
            {row.items.map((it) => cell(it, { width: cardWidth, height: tallHeight }))}
          </View>
        );
      }
      if (row.kind === "trio") {
        const third = (fullWidth - GRID_GAP * 2) / 3;
        return (
          <View style={{ flexDirection: "row", gap: GRID_GAP }}>
            {row.items.map((it) => cell(it, { width: third, height: third * (16 / 9) }))}
          </View>
        );
      }
      if (row.kind === "single") {
        // Only ever the one short in the list: full width, never half a row.
        return cell(row.item, { width: fullWidth, height: heroHeight, wide: true, hero: true });
      }
      // Stacked wide clips share the short's height; posters only, so a row
      // never runs more than the one preview the grid allows.
      const stackHeight = (tallHeight - GRID_GAP * (row.wides.length - 1)) / row.wides.length;
      const stack = (
        <View key="stack" style={{ width: cardWidth, gap: GRID_GAP }}>
          {row.wides.map((it) => cell(it, { width: cardWidth, height: stackHeight, wide: true, still: true }))}
        </View>
      );
      const tall = cell(row.tall, { width: cardWidth, height: tallHeight });
      return (
        <View style={{ flexDirection: "row", gap: GRID_GAP }}>
          {row.tallSide === "left" ? <>{tall}{stack}</> : <>{stack}{tall}</>}
        </View>
      );
    },
    [handleItemPress, markUnavailable, playStore, indexById, cardWidth, tallHeight, fullWidth, heroHeight],
  );

  const keyExtractor = useCallback((row: BrickRow<UnifiedFeedItem>) => row.key, []);

  if (initialLoading) {
    return (
      <View className="flex-1 px-2">
        {/* Same spacer the list carries in its ListHeaderComponent — without it
            the placeholder renders behind the collapsible header. */}
        <View style={topSpacerStyle} />
        <ShortsGridSkeleton />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <Pressable
          onPress={() => refetch()}
          className={isMinimal ? "px-5 py-2 border" : "px-5 py-2 rounded-xl bg-theme-neutrals-700"}
          // Minimal: outline only, no fill.
          style={isMinimal ? { borderColor: MINIMAL_TAB_LINE } : undefined}
        >
          <Text className="text-theme-neutrals-50 font-medium">{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2">
      <AnimatedFlatList
        ref={listRef}
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        // paddingBottom was missing entirely, so the last row of shorts sat
        // permanently under the floating nav pill — unreadable and untappable,
        // and it left bright video hard against the pill's edge, which is what
        // made the glass there look like it had lost its blur.
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: TAB_BAR_CONTENT_INSET,
          gap: GRID_GAP,
        }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={2}
        windowSize={9}
        removeClippedSubviews={false}
        onEndReached={loadMore}
        onEndReachedThreshold={2.5}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        onScroll={scrollHandler ?? handleScroll}
        onScrollBeginDrag={beginScroll}
        onScrollEndDrag={endScroll}
        onMomentumScrollBegin={beginScroll}
        onMomentumScrollEnd={endScroll}
        // See InfiniteVideoFeed: 16 is below Android's 17ms throttle floor.
        scrollEventThrottle={24}
        refreshControl={
          <DeHubRefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
            progressViewOffset={headerInset}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-6">
              <DeHubLoader size={32} />
            </View>
          ) : endReached && items.length > 0 ? (
            <View className="py-6 items-center">
              <Text className="text-theme-neutrals-400 text-xs">{t("feed.noMoreShorts")}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading ? (
            <View className="flex-1 items-center justify-center py-20">
              <Icon name="Film" size={48} color="#555" />
              <Text className="text-theme-neutrals-400 text-sm mt-4">{t("feed.noShortsFound")}</Text>
            </View>
          ) : null
        }
      />
      <DeHubRefreshMark pill={active} refreshing={refreshing} topInset={headerInset} />
    </View>
  );
};

// Kept mounted as one of Home's six pager pages — see InfiniteVideoFeed's note.
export default memo(ShortsGrid);
