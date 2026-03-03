import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  FlatList,
  ScrollView,
  Image,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
  BackHandler,
} from "react-native";
import Animated from "react-native-reanimated";
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

const fallbackCategories = ["All"];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const GRID_GAP = 2;

// Grid layout constants
// Pattern repeats every 9 items:
// Row 1: 1 big (2x2) + 2 small stacked = 3 items
// Row 2: 2 small stacked + 1 big (2x2) = 3 items  
// Row 3: 3 equal = 3 items
const SMALL_SIZE = (SCREEN_WIDTH - GRID_GAP * 2) / 3;
const BIG_SIZE = SMALL_SIZE * 2 + GRID_GAP;

const GridSkeleton: React.FC = () => {
  // Render 2 full patterns (18 items) for skeleton
  return (
    <View style={{ opacity: 0.6 }}>
      {/* Pattern 1 */}
      {/* Row 1: Big + 2 small */}
      <View style={skeletonStyles.patternRow}>
        <View style={[skeletonStyles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
        <View style={skeletonStyles.stackedColumn}>
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
      </View>
      {/* Row 2: 2 small + Big */}
      <View style={skeletonStyles.patternRow}>
        <View style={skeletonStyles.stackedColumn}>
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
        <View style={[skeletonStyles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
      </View>
      {/* Row 3: 3 equal */}
      <View style={skeletonStyles.equalRow}>
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
      </View>

      {/* Pattern 2 */}
      <View style={skeletonStyles.patternRow}>
        <View style={[skeletonStyles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
        <View style={skeletonStyles.stackedColumn}>
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
      </View>
      <View style={skeletonStyles.patternRow}>
        <View style={skeletonStyles.stackedColumn}>
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
          <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        </View>
        <View style={[skeletonStyles.skeletonItem, { width: BIG_SIZE, height: BIG_SIZE }]} />
      </View>
      <View style={skeletonStyles.equalRow}>
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
        <View style={[skeletonStyles.skeletonItem, { width: SMALL_SIZE, height: SMALL_SIZE }]} />
      </View>
    </View>
  );
};

const skeletonStyles = StyleSheet.create({
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

// Default filter state for FeedScreen - Latest sort, feed-images only
const defaultFilters: FeedFilters = {
  sortBy: "createdAt",
  dateRange: "",
  postType: "feed-images", // Fixed to feed-images
  contentAccess: [],
};

interface GridItemProps {
  item: UnifiedFeedItem;
  index: number;
  size: number;
  onPress: (index: number) => void;
}

const GridItem: React.FC<GridItemProps> = ({ item, index, size, onPress }) => {
  // Get images using the same logic as HomeFeedCard
  const imageUri = React.useMemo(() => {
    const urls: string[] = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    if (urls.length > 0) {
      return getImageUrlApiSimple(urls[0]);
    }
    const single = getImageUrl(item.imageUrl || item.thumbnailUrl || "");
    return single || null;
  }, [item]);

  const hasMultipleImages = (item.imageUrls?.length ?? 0) > 1;

  if (!imageUri) return null;

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onPress(index)}
      style={[styles.gridItem, { width: size, height: size }]}
    >
      <Image
        source={{ uri: imageUri }}
        style={styles.gridImage}
        resizeMode="cover"
      />
      {/* Multiple images indicator - no background */}
      {hasMultipleImages && (
        <View style={styles.multipleImagesIcon}>
          <Ionicons name="copy" size={16} color="#FFFFFF" style={styles.iconShadow} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const FeedScreen = () => {
  const { isSignedIn } = useAuthState();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  // Collapsible header
  const {
    headerAnimatedStyle,
    onHeaderLayout,
    scrollHandler,
    handleScroll: headerHandleScroll,
    handleScrollEnd,
    showHeader,
  } = useCollapsibleHeader();

  // View mode state - default to grid view
  const [isGridView, setIsGridView] = useState(true);

  // Shared feed data state
  const [feedData, setFeedData] = useState<UnifiedFeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedPage, setFeedPage] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(true);
  
  // FlatList ref for scroll position
  const feedListRef = useRef<FlatList<any>>(null);
  const gridListRef = useRef<ScrollView>(null);
  
  // Track current visible index for syncing between views
  const currentVisibleIndex = useRef(0);
  const pendingScrollIndex = useRef<number | null>(null);
  const feedLoadingRef = useRef(false);

  // Grid → feed transition overlay (ref for instant render, state for commit)
  const [transitionPending, setTransitionPending] = useState(false);

  // Switch from feed view back to grid
  const switchToGrid = useCallback(() => {
    setIsGridView(true);
    setFilterPanelVisible(false);
    showHeader();
  }, [showHeader]);

  // Intercept hardware back button in feed view → return to grid
  useEffect(() => {
    if (isGridView) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switchToGrid();
      return true;
    });
    return () => sub.remove();
  }, [isGridView, switchToGrid]);

  // Filter state
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(defaultFilters);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(fallbackCategories);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Load categories on mount
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setCategoriesLoading(true);
      const list = await getCategoriesCached();
      if (mounted && list && list.length) {
        const cleaned = [
          "All",
          ...list.filter((c) => c && c.toLowerCase() !== "all"),
        ];
        setCategories(cleaned);
        if (!cleaned.includes(selectedCategory)) setSelectedCategory("All");
      }
      setCategoriesLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Convert filter panel state to API params
  const feedParams = useMemo(() => {
    const params: Record<string, any> = {
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sortBy: filters.sortBy as FeedSortBy,
      sortOrder: "desc" as const,
      postType: "feed-images", // Always feed-images for FeedScreen
      status: "minted" as const,
    };

    // Date range
    if (filters.dateRange) {
      params.range = filters.dateRange as FeedRange;
    }

    return params;
  }, [selectedCategory, filters]);

  // Fetch feed data (shared between both views)
  const fetchFeedData = useCallback(
    async (page: number, refresh = false) => {
      if (feedLoadingRef.current && !refresh) return;
      feedLoadingRef.current = true;

      if (refresh) {
        setFeedRefreshing(true);
      } else {
        setFeedLoading(true);
      }

      try {
        const response = await getUnifiedFeed({
          ...feedParams,
          page,
          limit: 30,
        });

        const newItems = response.result || [];

        if (refresh || page === 0) {
          setFeedData(newItems);
        } else {
          setFeedData((prev) => [...prev, ...newItems]);
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
    [feedParams]
  );

  // Load feed data on mount
  useEffect(() => {
    fetchFeedData(0);
  }, []);

  // Reset feed data when filters change
  useEffect(() => {
    fetchFeedData(0, true);
  }, [feedParams]);

  const handleRefresh = useCallback(() => {
    showHeader();
    fetchFeedData(0, true);
  }, [fetchFeedData, showHeader]);

  // Handle tab press to scroll to top and refresh
  useEffect(() => {
    const unsubscribe = navigation.addListener("tabPress" as any, () => {
      if (!isFocused) return;
      // Refresh data
      handleRefresh();
      // Scroll to top for whichever view is active
      if (isGridView) {
        gridListRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        feedListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsubscribe;
  }, [navigation, isFocused, isGridView, handleRefresh]);

  const handleEndReached = useCallback(() => {
    if (!feedLoading && feedHasMore) {
      fetchFeedData(feedPage + 1);
    }
  }, [fetchFeedData, feedLoading, feedHasMore, feedPage]);

  // Handle scroll-to-index failure (target item not yet rendered)
  const handleScrollToIndexFailed = useCallback(
    (info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
      const offset = info.averageItemLength * info.index;
      feedListRef.current?.scrollToOffset({ offset, animated: false });
      setTimeout(() => {
        if (info.index <= feedData.length - 1) {
          feedListRef.current?.scrollToIndex({ index: info.index, animated: false });
        }
      }, 200);
    },
    [feedData.length]
  );

  // Track visible item in feed view
  const handleFeedViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        currentVisibleIndex.current = viewableItems[0].index;
      }
    },
    []
  );

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Compute safe initial scroll index (bounded by data length)
  const safeInitialIndex = useMemo(() => {
    if (feedData.length === 0) return 0;
    return Math.min(currentVisibleIndex.current, feedData.length - 1);
  }, [feedData.length, isGridView]); // Recalc when switching views

  // Compute grid scroll offset from item index
  // Pattern: rows 0,1 are "big+small" rows (height = BIG_SIZE), row 2 is equal row (height = SMALL_SIZE)
  const gridInitialOffset = useMemo(() => {
    const index = safeInitialIndex;
    // Each pattern of 3 rows contains 9 items
    const patternGroup = Math.floor(index / 9);
    const indexInPattern = index % 9;
    
    // Height of one full pattern (3 visual rows): 2 big rows + 1 small row
    const patternHeight = BIG_SIZE * 2 + SMALL_SIZE + GRID_GAP * 3;
    
    let offset = patternGroup * patternHeight;
    
    // Add offset based on position within pattern
    if (indexInPattern >= 6) {
      // In the 3-equal row (items 6,7,8)
      offset += BIG_SIZE * 2 + GRID_GAP * 2;
    } else if (indexInPattern >= 3) {
      // In the second big row (items 3,4,5)
      offset += BIG_SIZE + GRID_GAP;
    }
    // Items 0,1,2 are in first row, no additional offset
    
    return offset;
  }, [safeInitialIndex]);

  // When clicking a grid item, show overlay immediately then switch to feed view
  const handleGridItemPress = useCallback((index: number) => {
    currentVisibleIndex.current = index;
    pendingScrollIndex.current = index;
    // Show overlay instantly, defer the heavy view-switch to next frame
    setTransitionPending(true);
    requestAnimationFrame(() => {
      setIsGridView(false);
    });
  }, []);

  // Scroll feed list to target index when switching from grid to feed
  useEffect(() => {
    if (!isGridView && pendingScrollIndex.current != null) {
      const idx = pendingScrollIndex.current;
      pendingScrollIndex.current = null;
      // Wait for FlatList to mount and render initial items
      const scrollTimer = setTimeout(() => {
        feedListRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0 });
      }, 80);
      // Dismiss overlay after scroll settles
      const dismissTimer = setTimeout(() => {
        setTransitionPending(false);
      }, 220);
      return () => {
        clearTimeout(scrollTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [isGridView]);

  // Toggle view mode and sync scroll position
  const toggleViewMode = useCallback(() => {
    setIsGridView((prev) => !prev);
    setFilterPanelVisible(false);
    showHeader();
  }, [showHeader]);

  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    // Always keep postType as feed-images and ignore contentAccess
    setFilters({ ...newFilters, postType: "feed-images", contentAccess: [] });
  }, []);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  // Close filter panel when scrolling starts
  const handleScrollBegin = useCallback(() => {
    if (filterPanelVisible) {
      setFilterPanelVisible(false);
    }
  }, [filterPanelVisible]);

  // Grid view scroll handler — drives collapsible header + syncs index
  const handleGridScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      headerHandleScroll(e);
      const offsetY = e.nativeEvent.contentOffset.y;
      const rowHeight = SMALL_SIZE + GRID_GAP;
      const estimatedRow = Math.floor(offsetY / rowHeight);
      const patternIdx = Math.floor(estimatedRow / 3);
      const rowInPattern = estimatedRow % 3;
      let itemIndex = patternIdx * 9;
      if (rowInPattern === 1) itemIndex += 3;
      else if (rowInPattern >= 2) itemIndex += 6;
      currentVisibleIndex.current = Math.min(itemIndex, feedData.length - 1);
    },
    [headerHandleScroll, feedData.length],
  );

  // Handle category selection
  const handleCategoryPress = useCallback((cat: string) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);

    // Reset filters to default when "All" is selected
    if (cat === "All") {
      setFilters(defaultFilters);
    }
  }, [selectedCategory]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      {/* Collapsible header — slides up on scroll-down, reappears on scroll-up */}
      <View style={styles.headerClip}>
        <Animated.View style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          <ScreenHeader
            title="Explore"
            canGoBack={!isGridView}
            onBackPress={!isGridView ? switchToGrid : undefined}
          />

          {/* Category bar and filters - only show in feed view */}
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

      {/* Feed View */}
      {!isGridView && (
        <View className="flex-1 px-4">
          <Animated.FlatList
            ref={feedListRef}
            data={feedData}
            keyExtractor={(item: UnifiedFeedItem, index: number) =>
              `feed-${index}-${item.tokenId || item.id}`
            }
            renderItem={({ item }: { item: UnifiedFeedItem }) => (
              <HomeFeedCard item={item} />
            )}
            onViewableItemsChanged={handleFeedViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{ paddingBottom: 80 }}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            initialNumToRender={15}
            onScroll={scrollHandler}
            onScrollBeginDrag={handleScrollBegin}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={feedRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFFFFF"
              />
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
                  <Text className="text-theme-neutrals-400 text-xs">
                    No more content
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              !feedLoading ? (
                <View className="items-center py-10">
                  <Text className="text-theme-neutrals-400 text-sm mb-1">
                    No posts yet.
                  </Text>
                  <Text className="text-theme-neutrals-500 text-xs mb-2">
                    Pull to refresh or try again later.
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      )}

      {/* Grid View - Custom Pattern Layout */}
      {isGridView && (
        <ScrollView
          ref={gridListRef}
          contentContainerStyle={styles.gridContainer}
          contentOffset={{ x: 0, y: gridInitialOffset }}
          refreshControl={
            <RefreshControl
              refreshing={feedRefreshing}
              onRefresh={handleRefresh}
              tintColor="#FFFFFF"
            />
          }
          onScroll={handleGridScroll}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) => {
            handleScrollEnd();
            handleEndReached();
          }}
        >
          {/* Render grid in pattern groups */}
          {(() => {
            const rows: React.ReactNode[] = [];
            let i = 0;
            let patternIndex = 0;

            while (i < feedData.length) {
              const patternType = patternIndex % 3;

              if (patternType === 0 && i < feedData.length) {
                // Row type 1: Big left + 2 small stacked right
                const bigItem = feedData[i];
                const small1 = feedData[i + 1];
                const small2 = feedData[i + 2];

                rows.push(
                  <View key={`row-${patternIndex}`} style={styles.patternRow}>
                    {bigItem && (
                      <GridItem
                        item={bigItem}
                        index={i}
                        size={BIG_SIZE}
                        onPress={handleGridItemPress}
                      />
                    )}
                    <View style={styles.stackedColumn}>
                      {small1 && (
                        <GridItem
                          item={small1}
                          index={i + 1}
                          size={SMALL_SIZE}
                          onPress={handleGridItemPress}
                        />
                      )}
                      {small2 && (
                        <GridItem
                          item={small2}
                          index={i + 2}
                          size={SMALL_SIZE}
                          onPress={handleGridItemPress}
                        />
                      )}
                    </View>
                  </View>
                );
                i += 3;
              } else if (patternType === 1 && i < feedData.length) {
                // Row type 2: 2 small stacked left + Big right
                const small1 = feedData[i];
                const small2 = feedData[i + 1];
                const bigItem = feedData[i + 2];

                rows.push(
                  <View key={`row-${patternIndex}`} style={styles.patternRow}>
                    <View style={styles.stackedColumn}>
                      {small1 && (
                        <GridItem
                          item={small1}
                          index={i}
                          size={SMALL_SIZE}
                          onPress={handleGridItemPress}
                        />
                      )}
                      {small2 && (
                        <GridItem
                          item={small2}
                          index={i + 1}
                          size={SMALL_SIZE}
                          onPress={handleGridItemPress}
                        />
                      )}
                    </View>
                    {bigItem && (
                      <GridItem
                        item={bigItem}
                        index={i + 2}
                        size={BIG_SIZE}
                        onPress={handleGridItemPress}
                      />
                    )}
                  </View>
                );
                i += 3;
              } else if (patternType === 2 && i < feedData.length) {
                // Row type 3: 3 equal boxes
                const item1 = feedData[i];
                const item2 = feedData[i + 1];
                const item3 = feedData[i + 2];

                rows.push(
                  <View key={`row-${patternIndex}`} style={styles.equalRow}>
                    {item1 && (
                      <GridItem
                        item={item1}
                        index={i}
                        size={SMALL_SIZE}
                        onPress={handleGridItemPress}
                      />
                    )}
                    {item2 && (
                      <GridItem
                        item={item2}
                        index={i + 1}
                        size={SMALL_SIZE}
                        onPress={handleGridItemPress}
                      />
                    )}
                    {item3 && (
                      <GridItem
                        item={item3}
                        index={i + 2}
                        size={SMALL_SIZE}
                        onPress={handleGridItemPress}
                      />
                    )}
                  </View>
                );
                i += 3;
              }

              patternIndex++;
            }

            return rows;
          })()}

          {/* Skeleton loader when loading initial data */}
          {feedLoading && feedData.length === 0 && <GridSkeleton />}

          {/* Empty state */}
          {feedData.length === 0 && !feedLoading && (
            <View className="items-center py-10">
              <Text className="text-theme-neutrals-400 text-sm mb-1">
                No posts yet.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Transition overlay — hides layout churn when switching grid → feed */}
      {transitionPending && (
        <View style={styles.transitionOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {/* Floating Grid Button - only show in feed view */}
      {!isGridView && !transitionPending && (
        <View style={[styles.floatingButtonContainer, { bottom: insets.bottom  }]}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={toggleViewMode}
            style={styles.floatingButton}
          >
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
    overflow: 'hidden',
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
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
    // Add shadow for depth
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
  // Grid styles
  gridItem: {
    backgroundColor: "#262626",
  },
  gridImage: {
    width: "100%",
    height: "100%",
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
  // Pattern layout styles
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
  gridContainer: {
    paddingBottom: 80,
  },
});

export default FeedScreen;
