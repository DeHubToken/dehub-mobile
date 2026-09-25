import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet,
  Text,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { DeHubLoader } from "../DeHubLoader";
import { DeHubRefreshControl, DeHubRefreshMark } from "../Feed/DeHubRefreshControl";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { useNavigation, useScrollToTop } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { getUnifiedFeed } from "../../services/feed.unified.service";
import type { UnifiedFeedItem, UnifiedFeedParams } from "../../services/feed.unified.service";
import { buildFeedImageUrls, getImageUrl } from "../../libs/misc";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { theme } from "../../theme";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { flattenFeedPages } from "../../libs/feed-pages";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";

// Minimal: tiles sit on black while their image loads, and an empty tile or a
// skeleton cell is a faint lift off black rather than a grey square.
const MINIMAL_TILE_BG = "#000";
const MINIMAL_PLACEHOLDER_BG = "rgba(255,255,255,0.04)";

export interface HomeImageGridHandle {
  scrollToTopAndRefresh: () => void;
}

interface HomeImageGridProps {
  params?: Partial<UnifiedFeedParams>;
  pageSize?: number;
  gridRef?: React.MutableRefObject<HomeImageGridHandle | null>;
  headerInset?: number;
  /** Reanimated worklet scroll handler — when provided, scroll events stay on the UI thread. */
  scrollHandler?: any;
  onScrollOffset?: (offsetY: number, deltaY: number) => void;
  onScrollEnd?: () => void;
  onScrollBegin?: () => void;
  onRefresh?: () => void;
  /**
   * Opens the tapped post in the host's image drawer. Hosts that don't have one
   * (nothing today, but the grid doesn't need to know that) fall back to
   * pushing the ImageFeed screen.
   */
  onOpenImageFeed?: (index: number, items: UnifiedFeedItem[]) => void;
}

// Animated wrapper so a worklet onScroll runs on the UI thread; cast keeps FlatList generics.
const AnimatedFlatList = Animated.FlatList as unknown as typeof FlatList;

const GRID_GAP = 2;
const GRID_PADDING = 16;

// Tile sizes come from the live window width (useWindowDimensions), so
// split-screen and unfolding re-flow the grid instead of keeping the width
// the app started with.
const gridMetrics = (screenWidth: number) => {
  const small = (screenWidth - GRID_PADDING - GRID_GAP * 2) / 3;
  const big = small * 2 + GRID_GAP;
  const rowHeights = [big + GRID_GAP, big + GRID_GAP, small + GRID_GAP];
  return { small, big, rowHeights, patternHeight: rowHeights[0] + rowHeights[1] + rowHeights[2] };
};
type GridMetrics = ReturnType<typeof gridMetrics>;

interface GridItemProps {
  item: UnifiedFeedItem;
  index: number;
  size: number;
  onPress: (index: number) => void;
}

const GridItem = memo<GridItemProps>(({ item, index, size, onPress }) => {
  const imageUri = useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    // API-served post images are on a different host to the CDN and are not a
    // transformable remote source, so these stay as-is; only the CDN fallback
    // below can be sized. Tapping a tile opens the full-size original in the
    // drawer either way.
    if (urls.length > 0) return buildFeedImageUrls([urls[0]], size)[0] || null;
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "", size);
    return single || null;
  }, [item.imageUrls, item.imageUrl, item.thumbnailUrl, size]);

  const hasMultiple = (item.imageUrls?.length ?? 0) > 1;
  const handlePress = useCallback(() => onPress(index), [onPress, index]);
  const { isMinimal } = useAppTheme();

  if (!imageUri) return <View style={{ width: size, height: size, backgroundColor: isMinimal ? MINIMAL_PLACEHOLDER_BG : "#262626" }} />;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={{ width: size, height: size, backgroundColor: isMinimal ? MINIMAL_TILE_BG : "#262626" }}
    >
      <Image
        source={imageUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`home-grid-${item.tokenId || item.id}`}
        // Grid thumbnails are cheap to decode and numerous. Disk caching keeps
        // scroll-back fast without retaining every decoded bitmap in Glide's
        // memory cache for the lifetime of the six-page home pager.
        cachePolicy="disk"
        transition={150}
      />
      {hasMultiple && (
        <View style={styles.multipleImagesIcon}>
          <Icon name="Copy" size={16} color="#FFFFFF" />
        </View>
      )}
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.tokenId === next.item.tokenId &&
  prev.size === next.size &&
  prev.index === next.index
);

interface GridRowData {
  key: string;
  rowType: 0 | 1 | 2;
  startIndex: number;
}

const buildGridRows = (count: number): GridRowData[] => {
  const rows: GridRowData[] = [];
  let index = 0;
  let rowNum = 0;
  while (index < count) {
    const rowType = (rowNum % 3) as 0 | 1 | 2;
    rows.push({ key: `hgr-${rowNum}`, rowType, startIndex: index });
    index += 3;
    rowNum++;
  }
  return rows;
};

interface GridRowProps {
  row: GridRowData;
  data: UnifiedFeedItem[];
  onItemPress: (index: number) => void;
  m: GridMetrics;
}

const GridRow = memo<GridRowProps>(({ row, data, onItemPress, m }) => {
  const { rowType, startIndex } = row;
  const { small: SMALL_SIZE, big: BIG_SIZE } = m;
  const a = data[startIndex];
  const b = data[startIndex + 1];
  const c = data[startIndex + 2];

  if (rowType === 0) {
    return (
      <View style={styles.patternRow}>
        {a && <GridItem item={a} index={startIndex} size={BIG_SIZE} onPress={onItemPress} />}
        <View style={styles.stackedColumn}>
          {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
          {c && <GridItem item={c} index={startIndex + 2} size={SMALL_SIZE} onPress={onItemPress} />}
        </View>
      </View>
    );
  }
  if (rowType === 1) {
    return (
      <View style={styles.patternRow}>
        <View style={styles.stackedColumn}>
          {a && <GridItem item={a} index={startIndex} size={SMALL_SIZE} onPress={onItemPress} />}
          {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
        </View>
        {c && <GridItem item={c} index={startIndex + 2} size={BIG_SIZE} onPress={onItemPress} />}
      </View>
    );
  }
  return (
    <View style={styles.equalRow}>
      {a && <GridItem item={a} index={startIndex} size={SMALL_SIZE} onPress={onItemPress} />}
      {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
      {c && <GridItem item={c} index={startIndex + 2} size={SMALL_SIZE} onPress={onItemPress} />}
    </View>
  );
});

const GridSkeleton: React.FC = () => {
  const { isMinimal } = useAppTheme();
  const { small: SMALL_SIZE, big: BIG_SIZE } = gridMetrics(useWindowDimensions().width);
  const cell = isMinimal ? [styles.skeletonItem, styles.minimalSkeletonItem] : styles.skeletonItem;
  return (
    <View style={{ opacity: 0.6 }}>
      {[0, 1].map((p) => (
        <React.Fragment key={p}>
          <View style={styles.patternRow}>
            <View style={[cell, { width: BIG_SIZE, height: BIG_SIZE }]} />
            <View style={styles.stackedColumn}>
              <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
              <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            </View>
          </View>
          <View style={styles.patternRow}>
            <View style={styles.stackedColumn}>
              <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
              <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            </View>
            <View style={[cell, { width: BIG_SIZE, height: BIG_SIZE }]} />
          </View>
          <View style={styles.equalRow}>
            <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[cell, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
};

const getGridItemLayout = (m: GridMetrics, index: number) => {
  const patternGroup = Math.floor(index / 3);
  const rowInPattern = index % 3;
  const offset =
    patternGroup * m.patternHeight +
    (rowInPattern >= 1 ? m.rowHeights[0] : 0) +
    (rowInPattern >= 2 ? m.rowHeights[1] : 0);
  return { length: m.rowHeights[rowInPattern], offset, index };
};

const HomeImageGrid: React.FC<HomeImageGridProps> = ({
  params,
  pageSize = 20,
  gridRef,
  headerInset = 0,
  scrollHandler,
  onScrollOffset,
  onScrollEnd,
  onScrollBegin,
  onRefresh: onRefreshProp,
  onOpenImageFeed,
}) => {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);
  const { isMinimal } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const metrics = useMemo(() => gridMetrics(screenWidth), [screenWidth]);
  const listRef = useRef<FlatList>(null);
  const prevYRef = useRef(0);

  // Fixed height — see the note in InfiniteVideoFeed. Animating this resized the
  // list's content box on every frame of the header animation, which relaid out
  // the grid mid-scroll and shifted every row below it.
  const topSpacerStyle = useMemo(() => ({ height: headerInset }), [headerInset]);
  // Memoised so the header cell isn't a fresh element (and a fresh measurement)
  // on every list render.
  const listHeader = useMemo(() => <View style={topSpacerStyle} />, [topSpacerStyle]);

  const navigation = useNavigation<any>();

  useScrollToTop(listRef);

  const mergedParams = useMemo(() => ({
    ...(params || {}),
    postType: "feed-images" as const,
  }), [params]);

  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["home-images", mergedParams, pageSize],
    [mergedParams, pageSize],
  );

  // Cached + revalidated by react-query: switching tabs re-renders instantly
  // from cache (no skeleton flash) and refetches in the background when stale.
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
      getUnifiedFeed({ ...mergedParams, limit: pageSize, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const results = lastPage.result || [];
      if (results.length < pageSize || !lastPage.pagination?.hasMore) return undefined;
      return lastPageParam + 1;
    },
  });

  // Offset paging repeats rows across the page boundary; keep the first copy.
  const items = useMemo<UnifiedFeedItem[]>(
    () => flattenFeedPages<UnifiedFeedItem>(data?.pages ?? [], () => false),
    [data],
  );
  const endReached = hasNextPage === false;
  const error = queryError ? (queryError as Error).message || "Failed to load" : null;

  const loadMore = useCallback(() => {
    if (initialLoading || loadingMore || refreshing || !hasNextPage) return;
    fetchNextPage().catch(() => {});
  }, [initialLoading, loadingMore, refreshing, hasNextPage, fetchNextPage]);

  const onRefresh = useCallback(async () => {
    onRefreshProp?.();
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
      const prevY = prevYRef.current;
      const delta = y - prevY;
      prevYRef.current = y;
      onScrollOffset?.(y, delta);
    },
    [onScrollOffset],
  );

  const handleGridItemPress = useCallback((index: number) => {
    if (onOpenImageFeed) {
      onOpenImageFeed(index, items);
      return;
    }
    navigation.navigate(ScreenNames.ImageFeed as any, {
      initialIndex: index,
      initialItems: items,
      feedParams: mergedParams,
    });
  }, [items, navigation, mergedParams, onOpenImageFeed]);

  const gridRows = useMemo(() => buildGridRows(items.length), [items.length]);

  const renderGridRow = useCallback(
    ({ item: row }: { item: GridRowData }) => (
      <GridRow row={row} data={items} onItemPress={handleGridItemPress} m={metrics} />
    ),
    [items, handleGridItemPress, metrics],
  );
  const itemLayout = useCallback(
    (_data: any, index: number) => getGridItemLayout(metrics, index),
    [metrics],
  );

  const keyExtractor = useCallback((item: GridRowData) => item.key, []);

  if (initialLoading) {
    return (
      <View className="flex-1 px-2">
        {/* Same spacer the list carries in its ListHeaderComponent — without it
            the placeholder renders behind the collapsible header. */}
        <View style={topSpacerStyle} />
        <View className="rounded-xl overflow-hidden">
          <GridSkeleton />
        </View>
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-theme-neutrals-200 mb-4">{error}</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          className={isMinimal ? "px-5 py-2 border" : "px-5 py-2 rounded-xl bg-theme-neutrals-700"}
          // Minimal: outline only, no fill.
          style={isMinimal ? { borderColor: MINIMAL_TAB_LINE } : undefined}
        >
          <Text className="text-theme-neutrals-50 font-medium">{t("common.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 px-2">
      <AnimatedFlatList
        ref={listRef}
        data={gridRows}
        keyExtractor={keyExtractor}
        renderItem={renderGridRow}
        getItemLayout={itemLayout}
        ListHeaderComponent={listHeader}
        // Reserve room for the floating nav pill; without it the last grid row
        // is stuck underneath it.
        contentContainerStyle={{ paddingTop: 4, paddingBottom: TAB_BAR_CONTENT_INSET }}
        style={{ borderRadius: 12, overflow: 'hidden' }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={9}
        removeClippedSubviews={false}
        onEndReached={loadMore}
        onEndReachedThreshold={2.5}
        onScroll={scrollHandler ?? handleScroll}
        onScrollBeginDrag={onScrollBegin}
        onScrollEndDrag={onScrollEnd}
        onMomentumScrollEnd={onScrollEnd}
        scrollEventThrottle={16}
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
              <Text className="text-theme-neutrals-400 text-xs">{t("feed.noMoreImages")}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          !initialLoading ? (
            <View className="flex-1 items-center justify-center py-20">
              <Icon name="Image" size={48} color="#555" />
              <Text className="text-theme-neutrals-400 text-sm mt-4">{t("feed.noImagesFound")}</Text>
            </View>
          ) : null
        }
      />
      <DeHubRefreshMark refreshing={refreshing} topInset={headerInset} />
    </View>
  );
};

const styles = StyleSheet.create({
  multipleImagesIcon: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  patternRow: {
    flexDirection: "row",
    marginBottom: GRID_GAP,
    gap: GRID_GAP,
  },
  stackedColumn: {
    gap: GRID_GAP,
  },
  equalRow: {
    flexDirection: "row",
    marginBottom: GRID_GAP,
    gap: GRID_GAP,
  },
  skeletonItem: {
    backgroundColor: "#262626",
  },
  minimalSkeletonItem: {
    backgroundColor: MINIMAL_PLACEHOLDER_BG,
  },
});

export default memo(HomeImageGrid);
