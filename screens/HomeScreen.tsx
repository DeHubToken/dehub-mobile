import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import { theme } from "../theme";
import InfiniteVideoFeed, { type InfiniteVideoFeedHandle } from "../components/Home/InfiniteVideoFeed";
import HomeHeader from "../components/HomeHeader";
import CategorySelector from "../components/Home/CategorySelector";
import { useDrawer } from "../context/DrawerContext";
import CategorySelectorSkeleton from "../components/Home/CategorySelectorSkeleton";
import FeedFilterPanel, { FeedFilters } from "../components/Home/FeedFilterPanel";
import { getCategoriesCached } from "../services/nft.service";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import type { FeedRange, FeedSortBy, FeedPostType } from "../services/feed.unified.service";

const FALLBACK_CATEGORIES = ["All"];
const SHUFFLE_SEED_EXPIRY_MS = 30 * 60 * 1000;
const SEED_CHECK_INTERVAL_MS = 60_000;

const generateShuffleSeed = () => String(Date.now());

const DEFAULT_FILTERS: FeedFilters = {
  sortBy: "createdAt",
  dateRange: "",
  postType: "all",
  contentAccess: [],
};

export default function HomeScreen() {
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { openDrawer } = useDrawer();
  const feedRef = useRef<InfiniteVideoFeedHandle | null>(null);

  const {
    headerAnimatedStyle,
    onHeaderLayout,
    handleScrollOffset,
    handleScrollEnd,
    showHeader,
  } = useCollapsibleHeader();

  const [shuffleSeed, setShuffleSeed] = useState<string>(generateShuffleSeed);
  const shuffleSeedTimestamp = useRef<number>(Date.now());

  useEffect(() => {
    const checkSeedExpiry = () => {
      const now = Date.now();
      if (now - shuffleSeedTimestamp.current >= SHUFFLE_SEED_EXPIRY_MS) {
        setShuffleSeed(generateShuffleSeed());
        shuffleSeedTimestamp.current = now;
      }
    };
    checkSeedExpiry();
    const interval = setInterval(checkSeedExpiry, SEED_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const refreshShuffleSeed = useCallback(() => {
    setShuffleSeed(generateShuffleSeed());
    shuffleSeedTimestamp.current = Date.now();
  }, []);

  const feedParams = useMemo(() => {
    const params: Record<string, any> = {
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sortBy: filters.sortBy as FeedSortBy,
      sortOrder: "desc" as const,
      status: "minted" as const,
    };

    if (filters.sortBy === "random") params.shuffleSeed = shuffleSeed;
    if (filters.dateRange) params.range = filters.dateRange as FeedRange;
    if (filters.postType !== "all") params.postType = filters.postType as FeedPostType;
    if (filters.contentAccess.includes("ppv")) params.isPPV = true;
    if (filters.contentAccess.includes("bounty")) params.hasBounty = true;
    if (filters.contentAccess.includes("locked")) params.isLocked = true;

    return params;
  }, [selectedCategory, filters, shuffleSeed]);

  const closeFilterPanel = useCallback(() => setFilterPanelVisible(false), []);

  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    setFilters(newFilters);
  }, []);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  const handleScrollBegin = useCallback(() => {
    setFilterPanelVisible(false);
  }, []);

  const onScrollOffset = useCallback(
    (offsetY: number, deltaY: number) => {
      handleScrollOffset(offsetY, deltaY);
      if (deltaY > 0) closeFilterPanel();
    },
    [handleScrollOffset, closeFilterPanel],
  );

  const handleCategorySelect = useCallback((category: string) => {
    setSelectedCategory(category);
    setFilterPanelVisible(false);
  }, []);

  const handleRefresh = useCallback(() => {
    showHeader();
    refreshShuffleSeed();
  }, [showHeader, refreshShuffleSeed]);

  const handleLogoPress = useCallback(() => {
    showHeader();
    feedRef.current?.scrollToTopAndRefresh();
  }, [showHeader]);

  const handleRetry = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const list = await getCategoriesCached({ forceRefresh: true });
      if (list?.length) {
        const cleaned = ["All", ...list.filter((c) => c && c.toLowerCase() !== "all")];
        setCategories(cleaned);
        if (!cleaned.includes(selectedCategory)) setSelectedCategory("All");
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, [selectedCategory]);

  const handleClearFilters = useCallback(() => {
    setSelectedCategory("All");
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
  }, [refreshShuffleSeed]);

  const handleCategoryPress = useCallback((cat: string) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    if (cat === "All") setFilters(DEFAULT_FILTERS);
  }, [selectedCategory]);

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
      if (mounted) setCategoriesLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <View style={styles.headerClip}>
        <Animated.View style={headerAnimatedStyle} onLayout={onHeaderLayout}>
          <HomeHeader onLogoPress={handleLogoPress} onMenuPress={openDrawer} />

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
          />
        </Animated.View>
      </View>

      <InfiniteVideoFeed
        feedRef={feedRef}
        params={feedParams}
        pageSize={10}
        onRefresh={handleRefresh}
        onScrollBegin={handleScrollBegin}
        onScrollOffset={onScrollOffset}
        onScrollEnd={handleScrollEnd}
        onCategorySelect={handleCategorySelect}
        onRetry={handleRetry}
        onClearFilters={handleClearFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerClip: {
    overflow: "hidden",
  },
  filterSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
});
