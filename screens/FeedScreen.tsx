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
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useIsFocused } from "@react-navigation/native";
import HomeHeader from "../components/HomeHeader";
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

// =============================================================================
// Grid Skeleton Component
// =============================================================================

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

// =============================================================================
// Grid Item Component
// =============================================================================

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
      if (feedLoading && !refresh) return;

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
        setFeedLoading(false);
        setFeedRefreshing(false);
      }
    },
    [feedParams, feedLoading]
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
    fetchFeedData(0, true);
  }, [fetchFeedData]);

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

  // Estimated height of each feed card for scroll offset calculation
  const ESTIMATED_FEED_ITEM_HEIGHT = 450;

  // getItemLayout for feed list
  const getFeedItemLayout = useCallback(
    (_: any, index: number) => ({
      length: ESTIMATED_FEED_ITEM_HEIGHT,
      offset: ESTIMATED_FEED_ITEM_HEIGHT * index,
      index,
    }),
    []
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

  // When clicking a grid item, switch to feed view and snap to that item
  const handleGridItemPress = useCallback((index: number) => {
    currentVisibleIndex.current = index;
    setIsGridView(false);
  }, []);

  // Toggle view mode and sync scroll position
  const toggleViewMode = useCallback(() => {
    setIsGridView((prev) => !prev);
    setFilterPanelVisible(false);
  }, []);

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
      <HomeHeader />

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

          {/* Sliding filter panel - no postType or contentAccess */}
          <FeedFilterPanel
            visible={filterPanelVisible}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            hidePostType
            hideContentAccess
          />
        </>
      )}

      {/* Feed View */}
      {!isGridView && (
        <View className="flex-1 px-4">
          <FlatList
            ref={feedListRef}
            data={feedData}
            keyExtractor={(item, index) =>
              `feed-${index}-${item.tokenId || item.id}`
            }
            renderItem={({ item }) => (
              <HomeFeedCard item={item as UnifiedFeedItem} />
            )}
            getItemLayout={getFeedItemLayout}
            initialScrollIndex={safeInitialIndex > 0 ? safeInitialIndex : undefined}
            onViewableItemsChanged={handleFeedViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            contentContainerStyle={{ paddingBottom: 80 }}
            refreshControl={
              <RefreshControl
                refreshing={feedRefreshing}
                onRefresh={handleRefresh}
                tintColor="#FFFFFF"
              />
            }
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
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
          onScroll={(e) => {
            // Track scroll position for syncing
            const offsetY = e.nativeEvent.contentOffset.y;
            // Estimate which item is visible based on row heights
            const rowHeight = SMALL_SIZE + GRID_GAP;
            const estimatedRow = Math.floor(offsetY / rowHeight);
            // Each pattern of 3 rows contains 9 items
            const patternIndex = Math.floor(estimatedRow / 3);
            const rowInPattern = estimatedRow % 3;
            let itemIndex = patternIndex * 9;
            if (rowInPattern === 1) itemIndex += 3;
            else if (rowInPattern >= 2) itemIndex += 6;
            currentVisibleIndex.current = Math.min(itemIndex, feedData.length - 1);
          }}
          scrollEventThrottle={100}
          onMomentumScrollEnd={handleEndReached}
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

      {/* Floating Grid Button - only show in feed view */}
      {!isGridView && (
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
  gridContainer: {
    paddingBottom: 80,
  },
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
});

export default FeedScreen;
