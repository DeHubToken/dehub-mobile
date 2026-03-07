import React, { useCallback, useEffect, useMemo, useState, useRef, memo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  FlatList,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  BackHandler,
  ListRenderItemInfo,
} from "react-native";
import Animated from "react-native-reanimated";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import { theme } from "../theme";
import CategorySelector from "../components/Home/CategorySelector";
import CategorySelectorSkeleton from "../components/Home/CategorySelectorSkeleton";
import FeedFilterPanel, {
  FeedFilters,
} from "../components/Home/FeedFilterPanel";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import { useAuthState } from "../context/AuthContext";
import { getCategoriesCached } from "../services/nft.service";
import { getUnifiedFeed } from "../services/feed.unified.service";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import type { FeedRange, FeedSortBy } from "../services/feed.unified.service";
import { getImageUrl, getImageUrlApiSimple } from "../libs";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import { ScreenNames } from "../navigation/ScreenNames";

const fallbackCategories = ["All"];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;

// Grid layout constants — pattern repeats every 3 rows / 9 items:
// Row 0: 1 big (2×2) + 2 small stacked = 3 items  (height = BIG_SIZE)
// Row 1: 2 small stacked + 1 big (2×2) = 3 items  (height = BIG_SIZE)
// Row 2: 3 equal = 3 items                         (height = SMALL_SIZE)
const SMALL_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;
const BIG_SIZE = SMALL_SIZE * 2 + GRID_GAP;

// Heights for each row in the 3-row pattern (including gap below)
const ROW_HEIGHTS = [
  BIG_SIZE + GRID_GAP,   // row 0 — big + 2 small
  BIG_SIZE + GRID_GAP,   // row 1 — 2 small + big
  SMALL_SIZE + GRID_GAP, // row 2 — 3 equal
];
const PATTERN_HEIGHT = ROW_HEIGHTS[0] + ROW_HEIGHTS[1] + ROW_HEIGHTS[2];

// ─── GridItem ───────────────────────────────────────────────
interface GridItemProps {
  item: UnifiedFeedItem;
  index: number;
  size: number;
  onPress: (index: number) => void;
}

const GridItem = memo<GridItemProps>(({ item, index, size, onPress }) => {
  const imageUri = useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    if (urls.length > 0) return getImageUrlApiSimple(urls[0]);
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
    return single || null;
  }, [item.imageUrls, item.imageUrl, item.thumbnailUrl]);

  const hasMultiple = (item.imageUrls?.length ?? 0) > 1;
  const handlePress = useCallback(() => onPress(index), [onPress, index]);

  if (!imageUri) return <View style={{ width: size, height: size, backgroundColor: "#262626" }} />;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={{ width: size, height: size, backgroundColor: "#262626" }}
    >
      <Image
        source={imageUri}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        recyclingKey={`grid-${item.tokenId || item.id}`}
        transition={150}
      />
      {hasMultiple && (
        <View style={styles.multipleImagesIcon}>
          <Ionicons name="copy" size={16} color="#FFFFFF" style={styles.iconShadow} />
        </View>
      )}
    </TouchableOpacity>
  );
}, (prev, next) =>
  prev.item.tokenId === next.item.tokenId &&
  prev.size === next.size &&
  prev.index === next.index
);

// ─── Grid row types (virtualized via FlatList) ──────────────
// Each row in the grid FlatList renders 3 items from feedData.
interface GridRowData {
  key: string;
  rowType: 0 | 1 | 2; // 0 = big-left, 1 = big-right, 2 = three-equal
  startIndex: number;  // index into feedData
}

const buildGridRows = (count: number): GridRowData[] => {
  const rows: GridRowData[] = [];
  let index = 0;
  let rowNum = 0;
  while (index < count) {
    const rowType = (rowNum % 3) as 0 | 1 | 2;
    rows.push({ key: `gr-${rowNum}`, rowType, startIndex: index });
    index += 3;
    rowNum++;
  }
  return rows;
};

interface GridRowProps {
  row: GridRowData;
  data: UnifiedFeedItem[];
  onItemPress: (index: number) => void;
}

const GridRow = memo<GridRowProps>(({ row, data, onItemPress }) => {
  const { rowType, startIndex } = row;
  const a = data[startIndex];
  const b = data[startIndex + 1];
  const c = data[startIndex + 2];

  if (rowType === 0) {
    // Big left + 2 small stacked right
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
    // 2 small stacked left + big right
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
  // rowType === 2: 3 equal
  return (
    <View style={styles.equalRow}>
      {a && <GridItem item={a} index={startIndex} size={SMALL_SIZE} onPress={onItemPress} />}
      {b && <GridItem item={b} index={startIndex + 1} size={SMALL_SIZE} onPress={onItemPress} />}
      {c && <GridItem item={c} index={startIndex + 2} size={SMALL_SIZE} onPress={onItemPress} />}
    </View>
  );
});

// ─── Skeleton ───────────────────────────────────────────────
const GridSkeleton: React.FC = () => (
  <View style={{ opacity: 0.6 }}>
    {[0, 1].map((p) => (
      <React.Fragment key={p}>
        <View style={styles.patternRow}>
          <View style={[styles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
          <View style={styles.stackedColumn}>
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          </View>
        </View>
        <View style={styles.patternRow}>
          <View style={styles.stackedColumn}>
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
            <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          </View>
          <View style={[styles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
        </View>
        <View style={styles.equalRow}>
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[styles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
      </React.Fragment>
    ))}
  </View>
);

// ─── Default filter state ───────────────────────────────────
const defaultFilters: FeedFilters = {
  sortBy: "createdAt",
  dateRange: "",
  postType: "feed-images",
  contentAccess: [],
};

// ─── Deterministic row-height for getItemLayout ─────────────
const getGridItemLayout = (_data: any, index: number) => {
  // Each row in the pattern has a known height
  const patternGroup = Math.floor(index / 3);
  const rowInPattern = index % 3;
  const offset =
    patternGroup * PATTERN_HEIGHT +
    (rowInPattern >= 1 ? ROW_HEIGHTS[0] : 0) +
    (rowInPattern >= 2 ? ROW_HEIGHTS[1] : 0);
  return { length: ROW_HEIGHTS[rowInPattern], offset, index };
};

// Convert a feed-item index to the grid-row index that contains it
const itemIndexToRowIndex = (idx: number) => Math.floor(idx / 3);

// Convert a grid-row index to the y-offset
const rowIndexToOffset = (rowIdx: number) => {
  const patternGroup = Math.floor(rowIdx / 3);
  const rowInPattern = rowIdx % 3;
  let offset = patternGroup * PATTERN_HEIGHT;
  for (let r = 0; r < rowInPattern; r++) offset += ROW_HEIGHTS[r];
  return offset;
};

// ═════════════════════════════════════════════════════════════
// FeedScreen
// ═════════════════════════════════════════════════════════════
const FeedScreen = () => {
  const { isSignedIn } = useAuthState();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const {
    headerAnimatedStyle,
    onHeaderLayout,
    scrollHandler,
    handleScroll: headerHandleScroll,
    handleScrollEnd,
    showHeader,
  } = useCollapsibleHeader();

  // ── View mode ──────────────────────────────────────────────
  const [isGridView, setIsGridView] = useState(true);

  // ── Feed data ──────────────────────────────────────────────
  const [feedData, setFeedData] = useState<UnifiedFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedPage, setFeedPage] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const feedLoadingRef = useRef(false);

  // ── Refs ───────────────────────────────────────────────────
  const feedListRef = useRef<FlatList<any>>(null);
  const gridListRef = useRef<FlatList<any>>(null);
  const currentVisibleIndex = useRef(0);
  const pendingScrollIndex = useRef<number | null>(null);

  // ── Grid → feed transition overlay ─────────────────────────
  const [transitionPending, setTransitionPending] = useState(false);
  const transitionPendingRef = useRef(false);
  const scrollTargetIndex = useRef<number | null>(null);

  const switchToGrid = useCallback(() => {
    setIsGridView(true);
    setTransitionPending(false);
    transitionPendingRef.current = false;
    setFilterPanelVisible(false);
    showHeader();
  }, [showHeader]);

  useEffect(() => {
    if (isGridView) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      switchToGrid();
      return true;
    });
    return () => sub.remove();
  }, [isGridView, switchToGrid]);

  // ── Filters & categories ───────────────────────────────────
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(defaultFilters);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(fallbackCategories);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      const list = await getCategoriesCached();
      if (mounted && list?.length) {
        const cleaned = ["All", ...list.filter((c) => c && c.toLowerCase() !== "all")];
        setCategories(cleaned);
        if (!cleaned.includes(selectedCategory)) setSelectedCategory("All");
      }
      setCategoriesLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const feedParams = useMemo(() => {
    const params: Record<string, any> = {
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sortBy: filters.sortBy as FeedSortBy,
      sortOrder: "desc" as const,
      postType: "feed-images",
      status: "minted" as const,
    };
    if (filters.dateRange) params.range = filters.dateRange as FeedRange;
    return params;
  }, [selectedCategory, filters]);

  // ── Data fetching (single effect, no double-fetch) ─────────
  const fetchFeedData = useCallback(
    async (page: number, refresh = false) => {
      if (feedLoadingRef.current && !refresh) return;
      feedLoadingRef.current = true;

      if (refresh) setFeedRefreshing(true);
      else setFeedLoading(true);

      try {
        const response = await getUnifiedFeed({ ...feedParams, page, limit: 30 });
        const newItems = response.result || [];

        if (refresh || page === 0) {
          setFeedData(newItems);
        } else {
          // Deduplicate on append
          setFeedData((prev) => {
            const existingIds = new Set(prev.map((i) => i.tokenId ?? i.id));
            const unique = newItems.filter((i) => !existingIds.has(i.tokenId ?? i.id));
            return [...prev, ...unique];
          });
        }

        setFeedHasMore(response.pagination?.hasMore ?? newItems.length >= 30);
        setFeedPage(page);
      } catch (error) {
        console.error("[FeedScreen] Feed fetch error:", error);
      } finally {
        feedLoadingRef.current = false;
        setFeedLoading(false);
        setFeedRefreshing(false);
      }
    },
    [feedParams],
  );

  // Single fetch trigger — reacts to feedParams changes (including mount)
  const feedParamsRef = useRef(feedParams);
  useEffect(() => {
    const isParamChange =
      JSON.stringify(feedParams) !== JSON.stringify(feedParamsRef.current);
    feedParamsRef.current = feedParams;
    fetchFeedData(0, isParamChange);
  }, [feedParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    showHeader();
    fetchFeedData(0, true);
  }, [fetchFeedData, showHeader]);

  useEffect(() => {
    const unsub = navigation.addListener("tabPress" as any, () => {
      if (!isFocused) return;
      handleRefresh();
      if (isGridView) {
        gridListRef.current?.scrollToOffset({ offset: 0, animated: true });
      } else {
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation, isFocused, isGridView, handleRefresh]);

  const handleEndReached = useCallback(() => {
    if (!feedLoadingRef.current && feedHasMore) {
      fetchFeedData(feedPage + 1);
    }
  }, [fetchFeedData, feedHasMore, feedPage]);

  // Prefetch grid images so they're cached before scrolling into view
  useEffect(() => {
    if (feedData.length === 0) return;
    const urls: string[] = [];
    for (const item of feedData) {
      const imgs = Array.isArray(item.imageUrls) ? item.imageUrls : [];
      if (imgs.length > 0) {
        const u = getImageUrlApiSimple(imgs[0]);
        if (u) urls.push(u);
      } else {
        const u = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
        if (u) urls.push(u);
      }
    }
    if (urls.length > 0) Image.prefetch(urls);
  }, [feedData]);

  // ── Feed-view callbacks ────────────────────────────────────
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const offset = info.averageItemLength * info.index;
      feedListRef.current?.scrollToOffset({ offset, animated: false });
      requestAnimationFrame(() => {
        feedListRef.current?.scrollToIndex({ index: info.index, animated: false, viewPosition: 0 });
      });
    },
    [],
  );

  const handleFeedViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        currentVisibleIndex.current = viewableItems[0].index;
      }
      // Dismiss transition overlay once the scroll target is visible
      if (transitionPendingRef.current && scrollTargetIndex.current != null) {
        const targetVisible = viewableItems.some(
          (v) => v.index === scrollTargetIndex.current,
        );
        if (targetVisible) {
          transitionPendingRef.current = false;
          scrollTargetIndex.current = null;
          setTransitionPending(false);
        }
      }
    },
    [],
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // ── Grid rows (memoised) ───────────────────────────────────
  const gridRows = useMemo(() => buildGridRows(feedData.length), [feedData.length]);

  // ── Grid ↔ Feed sync ──────────────────────────────────────
  const handleGridItemPress = useCallback((index: number) => {
    const item = feedData[index];
    if (!item) return;
    const id = item.tokenId ?? item.id;
    if (id != null) {
      navigation.navigate(ScreenNames.FeedDetail as any, { postId: String(id) });
    }
  }, [feedData, navigation]);

  // Scroll feed list after grid→feed switch — overlay stays until target is viewable
  useEffect(() => {
    if (!isGridView && pendingScrollIndex.current != null) {
      const idx = pendingScrollIndex.current;
      pendingScrollIndex.current = null;
      const scrollTimer = setTimeout(() => {
        feedListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 });
      }, 50);
      // Safety: dismiss overlay after 2s if viewable-check never fires
      const safetyTimer = setTimeout(() => {
        if (transitionPendingRef.current) {
          transitionPendingRef.current = false;
          setTransitionPending(false);
        }
      }, 2000);
      return () => { clearTimeout(scrollTimer); clearTimeout(safetyTimer); };
    }
  }, [isGridView]);

  const toggleViewMode = useCallback(() => {
    if (!isGridView) {
      // Switching back to grid — scroll grid to the currently-visible feed item
      const rowIdx = itemIndexToRowIndex(currentVisibleIndex.current);
      requestAnimationFrame(() => {
        gridListRef.current?.scrollToIndex({ index: rowIdx, animated: false, viewPosition: 0 });
      });
    }
    setIsGridView((prev) => !prev);
    setFilterPanelVisible(false);
    showHeader();
  }, [showHeader, isGridView]);

  // ── Grid-row viewable tracking (for sync back to feed) ─────
  const handleGridViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ item: GridRowData; index: number | null }> }) => {
      if (viewableItems.length > 0) {
        const first = viewableItems[0].item as GridRowData;
        currentVisibleIndex.current = first.startIndex;
      }
    },
    [],
  );

  const gridViewabilityConfig = useRef({ itemVisiblePercentThreshold: 30 }).current;

  // ── Filter handlers ────────────────────────────────────────
  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    setFilters({ ...newFilters, postType: "feed-images", contentAccess: [] });
  }, []);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  const handleScrollBegin = useCallback(() => {
    if (filterPanelVisible) setFilterPanelVisible(false);
  }, [filterPanelVisible]);

  const handleCategoryPress = useCallback(
    (cat: string) => {
      if (cat === selectedCategory) return;
      setSelectedCategory(cat);
      if (cat === "All") setFilters(defaultFilters);
    },
    [selectedCategory],
  );

  // ── Grid row renderer ─────────────────────────────────────
  const renderGridRow = useCallback(
    ({ item }: ListRenderItemInfo<GridRowData>) => (
      <GridRow row={item} data={feedData} onItemPress={handleGridItemPress} />
    ),
    [feedData, handleGridItemPress],
  );

  const gridKeyExtractor = useCallback((item: GridRowData) => item.key, []);

  // ── Feed item renderer ────────────────────────────────────
  const feedKeyExtractor = useCallback(
    (item: UnifiedFeedItem) => `feed-${item.tokenId ?? item.id}`,
    [],
  );

  const renderFeedItem = useCallback(
    ({ item }: ListRenderItemInfo<UnifiedFeedItem>) => <HomeFeedCard item={item} />,
    [],
  );

  // ── Grid footer ───────────────────────────────────────────
  const GridFooter = useMemo(() => {
    if (feedLoading && feedData.length > 0) {
      return (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
        </View>
      );
    }
    return null;
  }, [feedLoading, feedData.length]);

  // ══════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════
  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {/* Collapsible header */}
      <View style={styles.headerClip}>
        <Animated.View style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          <ScreenHeader
            title="Explore"
            canGoBack={!isGridView}
            onBackPress={!isGridView ? switchToGrid : undefined}
          />

          {!isGridView && (
            <>
              <View style={styles.filterSection}>
                {categoriesLoading ? (
                  <CategorySelectorSkeleton />
                ) : (
                  <CategorySelector
                    categories={categories}
                    selectedCategory={selectedCategory}
                    onCategoryPress={handleCategoryPress}
                    onFilterPress={handleFilterPress}
                    isFilterOpen={filterPanelVisible}
                  />
                )}
              </View>
              <FeedFilterPanel
                visible={filterPanelVisible}
                filters={filters}
                onFiltersChange={handleFiltersChange}
                hidePostType
                hideContentAccess
              />
            </>
          )}
        </Animated.View>
      </View>

      {/* ── Feed View ─────────────────────────────────────── */}
      {!isGridView && (
        <View className="flex-1 px-4">
          <Animated.FlatList
            ref={feedListRef}
            data={feedData}
            keyExtractor={feedKeyExtractor}
            renderItem={renderFeedItem}
            onViewableItemsChanged={handleFeedViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{ paddingBottom: 80 }}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={11}
            onScroll={scrollHandler}
            onScrollBeginDrag={handleScrollBegin}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl refreshing={feedRefreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.8}
            ListFooterComponent={
              feedLoading && feedData.length > 0 ? (
                <View className="items-center py-6">
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : !feedHasMore && feedData.length > 0 ? (
                <View className="px-4 py-6 items-center">
                  <Text className="text-theme-neutrals-400 text-xs">No more content</Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              !feedLoading ? (
                <View className="items-center py-10">
                  <Text className="text-theme-neutrals-400 text-sm mb-1">No posts yet.</Text>
                  <Text className="text-theme-neutrals-500 text-xs mb-2">Pull to refresh or try again later.</Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* ── Grid View (virtualized FlatList) ──────────────── */}
      {isGridView && (
        <FlatList
          ref={gridListRef}
          data={gridRows}
          keyExtractor={gridKeyExtractor}
          renderItem={renderGridRow}
          getItemLayout={getGridItemLayout}
          onViewableItemsChanged={handleGridViewableItemsChanged}
          viewabilityConfig={gridViewabilityConfig}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={9}
          contentContainerStyle={{ paddingBottom: 80 }}
          refreshControl={
            <RefreshControl refreshing={feedRefreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" />
          }
          onScroll={headerHandleScroll}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          onEndReached={handleEndReached}
          onEndReachedThreshold={1.5}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={GridFooter}
          ListEmptyComponent={
            feedLoading ? (
              <GridSkeleton />
            ) : (
              <View className="items-center py-10">
                <Text className="text-theme-neutrals-400 text-sm mb-1">No posts yet.</Text>
              </View>
            )
          }
        />
      )}

      {/* Transition overlay */}
      {transitionPending && (
        <View style={styles.transitionOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Floating grid button — feed view only */}
      {!isGridView && !transitionPending && (
        <View style={[styles.floatingButtonContainer, { bottom: insets.bottom }]}>
          <TouchableOpacity activeOpacity={0.8} onPress={toggleViewMode} style={styles.floatingButton}>
            <BlurView
              intensity={80}
              tint="dark"
              style={styles.blurContainer}
              {...(Platform.OS === "android" ? { experimentalBlurMethod: "dimezisBlurView" } : {})}
            >
              <View style={styles.glassOverlay} />
              <MaterialIcons name="grid-on" size={18} color="#FFFFFF" />
            </BlurView>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  headerClip: {
    overflow: "hidden",
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 200,
  },
  filterSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  floatingButtonContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 100,
  },
  floatingButton: {
    width: 45,
    height: 45,
    borderRadius: 28,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  blurContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    overflow: "hidden",
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  multipleImagesIcon: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  iconShadow: {
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
});

export default FeedScreen;
