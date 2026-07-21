import React, { useState, useMemo, useCallback, useRef, useEffect, startTransition } from "react";
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

// The four tabs served by InfiniteVideoFeed. Each gets its own kept-mounted
// list (same pattern as images/shorts) so switching is an opacity flip, not a
// full FlatList data swap — the swap was the visible tab-switch jank.
const FEED_LIST_TYPES = ["all", "video", "feed-audio", "live"] as const;
type FeedListType = (typeof FEED_LIST_TYPES)[number];

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
  // One handle per feed-list tab; stable ref objects so InfiniteVideoFeed's
  // feedRef effect never re-fires from a new ref identity.
  const feedRefs = useRef<Record<FeedListType, { current: InfiniteVideoFeedHandle | null }>>({
    all: { current: null },
    video: { current: null },
    "feed-audio": { current: null },
    live: { current: null },
  });
  const imageGridRef = useRef<HomeImageGridHandle | null>(null);
  const shortsGridRef = useRef<ShortsGridHandle | null>(null);
  // Native gesture of the suggested-accounts carousel. The tab-switch fling waits
  // for it to fail, so swiping the carousel scrolls it instead of changing feed.
  const suggestedPanRef = useRef<any>(null);

  const isImageTab = filters.postType === "feed-images";
  const isShortsTab = filters.postType === "short";
  const isFeedTab = !isImageTab && !isShortsTab;

  // Keep all three lists mounted once created and just hide the inactive ones —
  // switching tabs is then a pure style flip (no unmount/mount), which is what
  // makes it feel instant. Hidden tabs are warmed up shortly after launch so
  // even the FIRST switch pays no mount cost.
  const [tabsWarm, setTabsWarm] = useState(false);
  const [imagesMounted, setImagesMounted] = useState(false);
  const [shortsMounted, setShortsMounted] = useState(false);
  // Feed lists mount on first visit; warmup mounts the rest (like images/shorts).
  const [mountedFeedTypes, setMountedFeedTypes] = useState<ReadonlySet<FeedListType>>(
    () => new Set<FeedListType>(["all"]),
  );
  useEffect(() => {
    if (isImageTab) setImagesMounted(true);
    if (isShortsTab) setShortsMounted(true);
    const pt = filters.postType as FeedListType;
    if (FEED_LIST_TYPES.includes(pt)) {
      setMountedFeedTypes((prev) =>
        prev.has(pt) ? prev : new Set(prev).add(pt),
      );
    }
  }, [isImageTab, isShortsTab, filters.postType]);
  useEffect(() => {
    if (tabsWarm) {
      setImagesMounted(true);
      setShortsMounted(true);
      setMountedFeedTypes(new Set(FEED_LIST_TYPES));
    }
  }, [tabsWarm]);

  const {
    translateY: headerTranslateY,
    headerHeight,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollHandler,
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

  // Each feed list has a hard-wired postType, so strip the active tab's
  // postType out of the shared params and re-add it per list. Query keys stay
  // identical to the prefetch keys below.
  const feedListParamsByType = useMemo(() => {
    const { postType: _pt, ...base } = feedParams;
    return {
      all: base,
      video: { ...base, postType: "video" as const },
      "feed-audio": { ...base, postType: "feed-audio" as const },
      live: { ...base, postType: "live" as const },
    } satisfies Record<FeedListType, Record<string, any>>;
  }, [feedParams]);

  // Prefetch the other main tabs' first pages shortly after launch so the
  // first switch to video/images/shorts renders instantly from cache, like
  // the web app. Keys must mirror the ones used by InfiniteVideoFeed,
  // HomeImageGrid and ShortsGrid exactly (including their pageSize props).
  const queryClient = useQueryClient();
  const feedParamsRef = useRef(feedParams);
  feedParamsRef.current = feedParams;

  useEffect(() => {
    const timer = setTimeout(() => {
      // Strip any active-tab postType so prefetch keys match the per-list keys.
      const { postType: _pt, ...base } = feedParamsRef.current;

      // Prefetch every postType the feed list serves so the first switch to
      // any tab renders from cache instead of a skeleton.
      for (const postType of ["video", "feed-audio", "live"] as const) {
        const p = { ...base, postType };
        queryClient.prefetchInfiniteQuery({
          queryKey: ["home-feed", p, 10],
          queryFn: ({ pageParam }) =>
            getUnifiedFeed({ ...p, limit: 10, page: pageParam as number }),
          initialPageParam: 1,
        });
      }

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

      // Mount the hidden tabs once their data prefetch is underway, so the
      // first switch renders an already-built list.
      setTabsWarm(true);
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

  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    setFilters(newFilters);
  }, []);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  const handleScrollBegin = useCallback(() => {
    setFilterPanelVisible(false);
  }, []);


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
      feedRefs.current[filters.postType as FeedListType]?.current?.scrollToTopAndRefresh();
    }
  }, [showHeader, isImageTab, isShortsTab, filters.postType]);

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
    setFilterPanelVisible(false);
    // Non-urgent: keeps the tab press/swipe responsive while the heavy list swap renders
    startTransition(() => {
      setFilters((prev) => ({ ...prev, postType }));
    });
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
        .requireExternalGestureToFail(suggestedPanRef)
        .onEnd(handleSwipeLeft),
      Gesture.Fling()
        .direction(Directions.RIGHT)
        .runOnJS(true)
        .requireExternalGestureToFail(suggestedPanRef)
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

      {(imagesMounted || isImageTab) && (
        <View
          style={[StyleSheet.absoluteFill, !isImageTab && styles.hiddenTab]}
          pointerEvents={isImageTab ? "auto" : "none"}
        >
          <HomeImageGrid
            gridRef={imageGridRef}
            params={feedParams}
            pageSize={20}
            headerInset={headerHeight}
            headerTranslateY={headerTranslateY}
            onRefresh={handleRefresh}
            onScrollBegin={handleScrollBegin}
            scrollHandler={scrollHandler}
            onScrollEnd={handleScrollEnd}
          />
        </View>
      )}

      {(shortsMounted || isShortsTab) && (
        <View
          style={[StyleSheet.absoluteFill, !isShortsTab && styles.hiddenTab]}
          pointerEvents={isShortsTab ? "auto" : "none"}
        >
          <ShortsGrid
            gridRef={shortsGridRef}
            active={isShortsTab}
            params={feedParams}
            pageSize={20}
            headerInset={headerHeight}
            headerTranslateY={headerTranslateY}
            onRefresh={handleRefresh}
            onScrollBegin={handleScrollBegin}
            scrollHandler={scrollHandler}
            onScrollEnd={handleScrollEnd}
          />
        </View>
      )}

      {FEED_LIST_TYPES.map((type) => {
        const isActiveFeed = isFeedTab && filters.postType === type;
        if (!mountedFeedTypes.has(type) && !isActiveFeed) return null;
        return (
          <View
            key={type}
            style={[StyleSheet.absoluteFill, !isActiveFeed && styles.hiddenTab]}
            pointerEvents={isActiveFeed ? "auto" : "none"}
          >
            <InfiniteVideoFeed
              feedRef={feedRefs.current[type]}
              // Only the visible list's carousel should claim the tab-switch
              // fling; hidden lists registering the shared ref would break it.
              suggestedPanRef={isActiveFeed ? suggestedPanRef : undefined}
              active={isActiveFeed}
              params={feedListParamsByType[type]}
              pageSize={10}
              headerInset={headerHeight}
              headerTranslateY={headerTranslateY}
              onRefresh={handleRefresh}
              onScrollBegin={handleScrollBegin}
              scrollHandler={scrollHandler}
              onScrollEnd={handleScrollEnd}
              onCategorySelect={handleCategorySelect}
              onRetry={handleRetry}
              onClearFilters={handleClearFilters}
            />
          </View>
        );
      })}
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // Inactive tabs stay mounted but invisible; opacity 0 layers are skipped by
  // the compositor, so hidden lists cost no GPU time while keeping their
  // scroll position and virtualized cells alive for instant switches.
  hiddenTab: { opacity: 0 },
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
