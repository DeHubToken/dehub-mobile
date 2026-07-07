import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, { runOnJS } from "react-native-reanimated";
import { useAnimatedReaction } from "react-native-reanimated";
import { Gesture, GestureDetector, Directions } from "react-native-gesture-handler";
import InfiniteVideoFeed, { type InfiniteVideoFeedHandle } from "../components/Home/InfiniteVideoFeed";
import HomeImageGrid, { type HomeImageGridHandle } from "../components/Home/HomeImageGrid";
import ShortsGrid, { type ShortsGridHandle } from "../components/Home/ShortsGrid";
import HomeHeader from "../components/HomeHeader";
import FeedNavBar from "../components/Home/FeedNavBar";
import { useDrawer } from "../context/DrawerContext";
import { useTabBarHide } from "../context/TabBarHideContext";
import FeedFilterPanel, { FeedFilters } from "../components/Home/FeedFilterPanel";
import StoriesBar from "../components/Story/StoriesBar";
import { getCategoriesCached } from "../services/nft.service";
import { storage } from "../libs/storage";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import { useQueryClient } from "@tanstack/react-query";
import { getUnifiedFeed, getShortsFeed } from "../services/feed.unified.service";
import type { FeedRange, FeedSortBy, FeedPostType } from "../services/feed.unified.service";

const FALLBACK_CATEGORIES: string[] = [];
const SHUFFLE_SEED_EXPIRY_MS = 30 * 60 * 1000;
const SEED_CHECK_INTERVAL_MS = 60_000;

const generateShuffleSeed = () => String(Date.now());

const DEFAULT_FILTERS: FeedFilters = {
  // Default home sort is chronological latest; "For You" (score) remains a filter option.
  sortBy: "createdAt",
  dateRange: "",
  postType: "all",
  contentAccess: [],
};

export default function HomeScreen() {
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);

  // Load persisted category on mount (MMKV is sync — no async race)
  useEffect(() => {
    try {
      const val = storage.getString("dehub:defaultCategory");
      if (val) setSelectedCategory(val);
    } catch {}
  }, []);
  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { openDrawer } = useDrawer();
  const feedRef = useRef<InfiniteVideoFeedHandle | null>(null);
  const imageGridRef = useRef<HomeImageGridHandle | null>(null);
  const shortsGridRef = useRef<ShortsGridHandle | null>(null);

  const isImageTab = filters.postType === "feed-images";
  const isShortsTab = filters.postType === "short";

  const {
    translateY: headerTranslateY,
    headerHeight,
    headerAnimatedStyle,
    onHeaderLayout,
    handleScrollOffset,
    handleScrollEnd,
    showHeader,
  } = useCollapsibleHeader();

  // Sync header translateY to the bottom tab bar context
  const tabBarHide = useTabBarHide();
  useAnimatedReaction(
    () => headerTranslateY.value,
    (val) => {
      if (tabBarHide) tabBarHide.value = val;
    },
  );

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

  // Prefetch the other main tabs' first pages shortly after launch so the
  // first switch to video/images/shorts renders instantly from cache, like
  // the web app. Keys must mirror the ones used by InfiniteVideoFeed,
  // HomeImageGrid and ShortsGrid exactly (including their pageSize props).
  const queryClient = useQueryClient();
  const feedParamsRef = useRef(feedParams);
  feedParamsRef.current = feedParams;

  useEffect(() => {
    const timer = setTimeout(() => {
      const base = feedParamsRef.current;

      const videoParams = { ...base, postType: "video" as const };
      queryClient.prefetchInfiniteQuery({
        queryKey: ["home-feed", videoParams, 10],
        queryFn: ({ pageParam }) =>
          getUnifiedFeed({ ...videoParams, limit: 10, page: pageParam as number }),
        initialPageParam: 1,
      });

      const imageParams = { ...base, postType: "feed-images" as const };
      queryClient.prefetchInfiniteQuery({
        queryKey: ["home-images", imageParams, 20],
        queryFn: ({ pageParam }) =>
          getUnifiedFeed({ ...imageParams, limit: 20, page: pageParam as number }),
        initialPageParam: 1,
      });

      const shortsParams = { ...base, postType: "short" as const };
      queryClient.prefetchInfiniteQuery({
        queryKey: ["home-shorts", shortsParams, 20],
        queryFn: ({ pageParam }) => {
          const p = pageParam as { page: number; shuffleSeed?: string };
          return getShortsFeed({
            ...shortsParams,
            limit: 20,
            page: p.page,
            shuffleSeed: p.shuffleSeed,
          });
        },
        initialPageParam: { page: 1 },
      });
    }, 2500);
    return () => clearTimeout(timer);
  }, [queryClient]);

  const hasActiveFilters = useMemo(() => {
    return (
      filters.sortBy !== DEFAULT_FILTERS.sortBy ||
      filters.dateRange !== DEFAULT_FILTERS.dateRange ||
      filters.contentAccess.length > 0 ||
      !!selectedCategory
    );
  }, [filters, selectedCategory]);

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
    const value = category === "All" ? undefined : category;
    setSelectedCategory(value);
    try { storage.set("dehub:defaultCategory", value ?? ""); } catch {}
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
    } else if (isShortsTab) {
      shortsGridRef.current?.scrollToTopAndRefresh();
    } else {
      feedRef.current?.scrollToTopAndRefresh();
    }
  }, [showHeader, isImageTab, isShortsTab]);

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
    try { storage.set("dehub:defaultCategory", value ?? ""); } catch {}
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

  const tabOrder: FeedFilters["postType"][] = ["all", "video", "feed-images", "short", "feed-audio", "live"];

  const handleSwipeLeft = useCallback(() => {
    const currentIndex = tabOrder.indexOf(filters.postType);
    if (currentIndex >= 0 && currentIndex < tabOrder.length - 1) {
      handlePostTypeChange(tabOrder[currentIndex + 1]);
    }
  }, [filters.postType, handlePostTypeChange]);

  const handleSwipeRight = useCallback(() => {
    const currentIndex = tabOrder.indexOf(filters.postType);
    if (currentIndex > 0) {
      handlePostTypeChange(tabOrder[currentIndex - 1]);
    }
  }, [filters.postType, handlePostTypeChange]);

  const swipeGesture = useMemo(() => {
    return Gesture.Simultaneous(
      Gesture.Fling()
        .direction(Directions.LEFT)
        .runOnJS(true)
        .onEnd(handleSwipeLeft),
      Gesture.Fling()
        .direction(Directions.RIGHT)
        .runOnJS(true)
        .onEnd(handleSwipeRight)
    );
  }, [handleSwipeLeft, handleSwipeRight]);

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
    <GestureDetector gesture={swipeGesture}>
      <View className="flex-1 bg-theme-neutrals-900">
        <Animated.View style={[styles.headerClip, headerAnimatedStyle]} onLayout={onHeaderLayout}>
          <HomeHeader
            onLogoPress={handleLogoPress}
            onMenuPress={openDrawer}
          />

          <FeedNavBar
            activePostType={filters.postType}
            isFilterOpen={filterPanelVisible}
            hasActiveFilters={hasActiveFilters}
            onPostTypeChange={handlePostTypeChange}
            onFilterPress={handleFilterPress}
          />

          {filters.postType === "all" ? <StoriesBar /> : null}

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

      {isImageTab && (
        <View style={StyleSheet.absoluteFill}>
          <HomeImageGrid
            gridRef={imageGridRef}
            params={feedParams}
            pageSize={20}
            headerInset={headerHeight}
            headerTranslateY={headerTranslateY}
            onRefresh={handleRefresh}
            onScrollBegin={handleScrollBegin}
            onScrollOffset={onScrollOffset}
            onScrollEnd={handleScrollEnd}
          />
        </View>
      )}

      {isShortsTab && (
        <View style={StyleSheet.absoluteFill}>
          <ShortsGrid
            gridRef={shortsGridRef}
            params={feedParams}
            pageSize={20}
            headerInset={headerHeight}
            headerTranslateY={headerTranslateY}
            onRefresh={handleRefresh}
            onScrollBegin={handleScrollBegin}
            onScrollOffset={onScrollOffset}
            onScrollEnd={handleScrollEnd}
          />
        </View>
      )}

      {!isImageTab && !isShortsTab && (
        <View style={StyleSheet.absoluteFill}>
          <InfiniteVideoFeed
            feedRef={feedRef}
            params={feedParams}
            pageSize={10}
            headerInset={headerHeight}
            headerTranslateY={headerTranslateY}
            onRefresh={handleRefresh}
            onScrollBegin={handleScrollBegin}
            onScrollOffset={onScrollOffset}
            onScrollEnd={handleScrollEnd}
            onCategorySelect={handleCategorySelect}
            onRetry={handleRetry}
            onClearFilters={handleClearFilters}
          />
        </View>
      )}
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  headerClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: "hidden",
    backgroundColor: "#010305",
  },
});
