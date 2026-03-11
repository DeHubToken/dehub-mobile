import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated from "react-native-reanimated";
import InfiniteVideoFeed, { type InfiniteVideoFeedHandle } from "../components/Home/InfiniteVideoFeed";
import HomeImageGrid, { type HomeImageGridHandle } from "../components/Home/HomeImageGrid";
import HomeHeader from "../components/HomeHeader";
import FeedNavBar from "../components/Home/FeedNavBar";
import { useDrawer } from "../context/DrawerContext";
import FeedFilterPanel, { FeedFilters } from "../components/Home/FeedFilterPanel";
import { getCategoriesCached } from "../services/nft.service";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import type { FeedRange, FeedSortBy, FeedPostType } from "../services/feed.unified.service";

const FALLBACK_CATEGORIES: string[] = [];
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
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { openDrawer } = useDrawer();
  const feedRef = useRef<InfiniteVideoFeedHandle | null>(null);
  const imageGridRef = useRef<HomeImageGridHandle | null>(null);

  const isImageTab = filters.postType === "feed-images";

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
      category: selectedCategory,
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
    setSelectedCategory(category === "All" ? undefined : category);
    setFilterPanelVisible(false);
  }, []);

  const handleRefresh = useCallback(() => {
    showHeader();
    refreshShuffleSeed();
  }, [showHeader, refreshShuffleSeed]);

  const handleLogoPress = useCallback(() => {
    showHeader();
    if (isImageTab) {
      imageGridRef.current?.scrollToTopAndRefresh();
    } else {
      feedRef.current?.scrollToTopAndRefresh();
    }
  }, [showHeader, isImageTab]);

  const handleRetry = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const list = await getCategoriesCached({ forceRefresh: true });
      if (list?.length) {
        const cleaned = list.filter((c) => c && c.toLowerCase() !== "all");
        setCategories(cleaned);
        if (selectedCategory && !cleaned.includes(selectedCategory)) setSelectedCategory(undefined);
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, [selectedCategory]);

  const handleClearFilters = useCallback(() => {
    setSelectedCategory(undefined);
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
  }, [refreshShuffleSeed]);

  const handleCategoryPress = useCallback((cat: string) => {
    const value = cat === "All" ? undefined : cat;
    if (value === selectedCategory) return;
    setSelectedCategory(value);
    if (!value) setFilters(DEFAULT_FILTERS);
  }, [selectedCategory]);

  const handlePostTypeChange = useCallback((postType: FeedFilters["postType"]) => {
    setFilters((prev) => ({ ...prev, postType }));
    setFilterPanelVisible(false);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSelectedCategory(undefined);
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
    setFilterPanelVisible(false);
  }, [refreshShuffleSeed]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      const list = await getCategoriesCached();
      if (mounted && list?.length) {
        const cleaned = list.filter((c) => c && c.toLowerCase() !== "all");
        setCategories(cleaned);
        if (selectedCategory && !cleaned.includes(selectedCategory)) setSelectedCategory(undefined);
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

          <FeedNavBar
            activePostType={filters.postType}
            isFilterOpen={filterPanelVisible}
            onPostTypeChange={handlePostTypeChange}
            onFilterPress={handleFilterPress}
          />

          <FeedFilterPanel
            visible={filterPanelVisible}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryPress={handleCategoryPress}
            onResetFilters={handleResetFilters}
          />
        </Animated.View>
      </View>

      {isImageTab ? (
        <HomeImageGrid
          gridRef={imageGridRef}
          params={feedParams}
          pageSize={20}
          onRefresh={handleRefresh}
          onScrollBegin={handleScrollBegin}
          onScrollOffset={onScrollOffset}
          onScrollEnd={handleScrollEnd}
        />
      ) : (
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerClip: {
    overflow: "hidden",
  },
});
