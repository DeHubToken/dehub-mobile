import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from "react";
import { View, StyleSheet, InteractionManager, useWindowDimensions } from "react-native";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { PagerGestureProvider } from "../context/PagerGestureContext";
import InfiniteVideoFeed, { type InfiniteVideoFeedHandle } from "../components/Home/InfiniteVideoFeed";
import HomeImageGrid, { type HomeImageGridHandle } from "../components/Home/HomeImageGrid";
import ShortsGrid, { type ShortsGridHandle } from "../components/Home/ShortsGrid";
import HomeHeader from "../components/HomeHeader";
import FeedNavBar from "../components/Home/FeedNavBar";
import { useDrawer } from "../context/DrawerContext";
import { useTabBarHide } from "../context/TabBarHideContext";
import FeedFilterPanel, { FeedFilters, PostTypeOption } from "../components/Home/FeedFilterPanel";
import StoriesBar from "../components/Story/StoriesBar";
import { getCategoriesCached } from "../services/nft.service";
import { storage } from "../libs/storage";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import FeedFilterLoader from "../components/Home/FeedFilterLoader";
import { useFeedFilterTransition } from "../hooks/useFeedFilterTransition";
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

// The six tabs of the nav bar, in pager order. Every one of them is a page in
// the horizontal pager below, which is what makes a swipe track the finger
// instead of waiting for a fling to be recognised and then swapping lists.
const TAB_ORDER = ["all", "video", "feed-images", "short", "feed-audio", "live"] as const;
type TabKey = (typeof TAB_ORDER)[number];
const LAST_INDEX = TAB_ORDER.length - 1;

// The four tabs served by InfiniteVideoFeed (images and shorts have their own
// grid components). Each gets its own kept-mounted list so switching never
// re-creates a FlatList.
const FEED_LIST_TYPES = ["all", "video", "feed-audio", "live"] as const;
type FeedListType = (typeof FEED_LIST_TYPES)[number];

// Page-turn animation. Short and front-loaded: the page should be visibly
// settling by the time the finger leaves the glass.
const PAGE_ANIM = { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;
// How far past the first/last tab a drag is allowed to pull, as a fraction of
// the real distance — the give is what tells you there is nothing beyond.
const EDGE_RESISTANCE = 0.28;
// Seconds of flick velocity folded into the release position, so a fast short
// swipe turns the page instead of snapping back. Waiting for half a screen of
// travel is precisely what read as slow.
const VELOCITY_PROJECTION = 0.12;
// Gap between warm-up steps. One list per tick: mounting all six in a single
// commit (what the old 2.5s timer did) stalls the JS thread for long enough to
// drop a visible run of frames.
const WARM_STEP_MS = 220;
const PREFETCH_STEP_MS = 260;

/**
 * Pager slot for a post type. Filter-panel-only types ("feed-simple") have no
 * tab of their own, so they render in the Home slot — previously they matched
 * no list at all and left the screen blank.
 */
const indexForPostType = (postType: PostTypeOption): number => {
  const i = TAB_ORDER.indexOf(postType as TabKey);
  return i >= 0 ? i : 0;
};

export default function HomeScreen() {
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const { width: pageWidth } = useWindowDimensions();

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
  // Published to the page tree so horizontally-scrolling descendants (image
  // galleries, the suggestions carousel) can block the page turn while they are
  // scrolling — see PagerGestureContext.
  const pagerGestureRef = useRef<GestureType | undefined>(undefined);

  const activeIndex = indexForPostType(filters.postType);
  const activeTabKey = TAB_ORDER[activeIndex];
  // Starting and stopping video playback is the expensive half of a tab switch
  // and none of it is on screen yet — the pager translate already moved. Let it
  // ride a deferred value so the tap itself never waits on it.
  const deferredIndex = useDeferredValue(activeIndex);

  // Pages mount on first approach and stay mounted; warm-up fills in the rest a
  // page at a time. Hidden pages sit off-screen in the pager row, so they cost
  // no compositing at all — the old build stacked all six as absolutely
  // positioned siblings at opacity 0.
  const [mountedTabs, setMountedTabs] = useState<ReadonlySet<TabKey>>(
    () => new Set<TabKey>(["all"]),
  );

  // Derived during render, not in an effect, so a tab tapped from across the bar
  // mounts in the same commit that moves the pager — an effect would paint one
  // blank frame first. Neighbours are included because a drag reveals them.
  const visibleTabs = useMemo(() => {
    const next = new Set(mountedTabs);
    next.add(TAB_ORDER[activeIndex]);
    if (activeIndex > 0) next.add(TAB_ORDER[activeIndex - 1]);
    if (activeIndex < LAST_INDEX) next.add(TAB_ORDER[activeIndex + 1]);
    return next;
  }, [mountedTabs, activeIndex]);

  useEffect(() => {
    if (visibleTabs.size !== mountedTabs.size) setMountedTabs(visibleTabs);
  }, [visibleTabs, mountedTabs]);

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

  // Deliberately carries no postType: every consumer overrides it with its own
  // (HomeImageGrid → feed-images, ShortsGrid → short, each feed list → its own
  // key), so including it here only rebuilt this object on every tab switch and
  // re-rendered all six lists for nothing.
  const feedParams = useMemo(() => {
    const params: Record<string, any> = {
      category: selectedCategory,
      sortBy: filters.sortBy as FeedSortBy,
      sortOrder: "desc" as const,
      status: "minted" as const,
    };

    if (filters.sortBy === "random") params.shuffleSeed = shuffleSeed;
    if (filters.dateRange) params.range = filters.dateRange as FeedRange;
    if (filters.contentAccess.includes("ppv")) params.isPPV = true;
    if (filters.contentAccess.includes("bounty")) params.hasBounty = true;
    if (filters.contentAccess.includes("locked")) params.isLocked = true;

    return params;
  }, [selectedCategory, filters.sortBy, filters.dateRange, filters.contentAccess, shuffleSeed]);

  // The Home slot doubles as the target for filter-panel post types with no tab
  // of their own, so it is the one list whose postType isn't simply its own key.
  const homeSlotPostType = useMemo<FeedPostType | undefined>(
    () =>
      TAB_ORDER.includes(filters.postType as TabKey)
        ? undefined
        : (filters.postType as FeedPostType),
    [filters.postType],
  );

  // Each feed list has a hard-wired postType. Query keys stay identical to the
  // prefetch keys below.
  const feedListParamsByType = useMemo(() => {
    return {
      all: homeSlotPostType ? { ...feedParams, postType: homeSlotPostType } : feedParams,
      video: { ...feedParams, postType: "video" as const },
      "feed-audio": { ...feedParams, postType: "feed-audio" as const },
      live: { ...feedParams, postType: "live" as const },
    } satisfies Record<FeedListType, Record<string, any>>;
  }, [feedParams, homeSlotPostType]);

  // ── Pager ────────────────────────────────────────────────────────────────
  // progress is the pager position in page units (2.4 = 40% of the way from the
  // Images tab to Shorts). It is the single source of truth for both the page
  // translate and the nav bar's glass indicator, so they can never disagree —
  // the old build animated the indicator on one clock and swapped the list on
  // another, which is why the highlight moved while the feed below sat still.
  const progress = useSharedValue(activeIndex);
  const dragStart = useSharedValue(activeIndex);
  // Index the gesture has already animated to, so the sync effect below doesn't
  // restart the same animation a frame later.
  const animatedToRef = useRef(activeIndex);

  useEffect(() => {
    if (animatedToRef.current === activeIndex) return;
    const from = animatedToRef.current;
    animatedToRef.current = activeIndex;
    cancelAnimation(progress);
    // Jumping more than one tab lands immediately. Sliding four screens of feed
    // past the eye takes longer than the tap saved and reads as lag, not motion.
    if (Math.abs(activeIndex - from) > 1) progress.value = activeIndex;
    else progress.value = withTiming(activeIndex, PAGE_ANIM);
  }, [activeIndex, progress]);

  const setPostType = useCallback((postType: PostTypeOption) => {
    setFilterPanelVisible(false);
    setFilters((prev) => (prev.postType === postType ? prev : { ...prev, postType }));
  }, []);

  // Called from the UI thread once a drag has picked its landing page. The
  // animation is already running by then; this only catches React up.
  const commitIndex = useCallback(
    (index: number) => {
      animatedToRef.current = index;
      setPostType(TAB_ORDER[index]);
    },
    [setPostType],
  );

  const pagerGesture = useMemo(
    () =>
      Gesture.Pan()
        // Horizontal intent only: a vertical drag belongs to the feed's own
        // scroll view and must never be stolen by the pager.
        .activeOffsetX([-14, 14])
        .failOffsetY([-14, 14])
        .withRef(pagerGestureRef)
        .onStart(() => {
          cancelAnimation(progress);
          dragStart.value = progress.value;
        })
        .onUpdate((e) => {
          if (pageWidth <= 0) return;
          const raw = dragStart.value - e.translationX / pageWidth;
          if (raw < 0) progress.value = raw * EDGE_RESISTANCE;
          else if (raw > LAST_INDEX)
            progress.value = LAST_INDEX + (raw - LAST_INDEX) * EDGE_RESISTANCE;
          else progress.value = raw;
        })
        .onEnd((e) => {
          if (pageWidth <= 0) return;
          const from = Math.round(dragStart.value);
          const projected = progress.value - (e.velocityX / pageWidth) * VELOCITY_PROJECTION;
          let target = Math.round(projected);
          // One page per gesture, however hard it was thrown.
          if (target > from + 1) target = from + 1;
          if (target < from - 1) target = from - 1;
          if (target < 0) target = 0;
          if (target > LAST_INDEX) target = LAST_INDEX;
          progress.value = withTiming(target, PAGE_ANIM);
          if (target !== from) runOnJS(commitIndex)(target);
        }),
    [pageWidth, commitIndex, progress, dragStart],
  );

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -progress.value * pageWidth }],
  }));

  // ── Filter loader ────────────────────────────────────────────────────────
  // A filter change re-keys every mounted page at once (four feed lists plus
  // the image and shorts grids), so "is the feed still working" is a property
  // of the whole screen, not of one list. Counting in-flight queries across the
  // three feed families is the only place that view exists.
  const feedQueriesInFlight = useIsFetching({
    predicate: (query) => {
      const family = query.queryKey?.[0];
      return (
        family === "home-feed" ||
        family === "home-images" ||
        family === "home-shorts"
      );
    },
  });
  const filterTransition = useFeedFilterTransition(feedQueriesInFlight > 0);

  // ── Warm-up ──────────────────────────────────────────────────────────────
  const queryClient = useQueryClient();
  const feedParamsRef = useRef(feedParams);
  feedParamsRef.current = feedParams;

  // Mount the remaining pages one at a time once the first interaction has
  // settled, so the first switch to any tab renders an already-built list.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      TAB_ORDER.forEach((key, i) => {
        timers.push(
          setTimeout(() => {
            if (cancelled) return;
            setMountedTabs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
          }, i * WARM_STEP_MS),
        );
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
      timers.forEach(clearTimeout);
    };
  }, []);

  // Prefetch the other tabs' first pages so the first switch renders from cache
  // instead of a skeleton. Keys mirror the ones used by InfiniteVideoFeed,
  // HomeImageGrid and ShortsGrid exactly (including their pageSize props).
  // Staggered: five concurrent requests fired at once saturated the connection
  // and landed their parses in the same handful of frames.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const base = feedParamsRef.current;

      const jobs: Array<() => void> = [
        ...(["video", "feed-audio", "live"] as const).map((postType) => () => {
          const p = { ...base, postType };
          queryClient.prefetchInfiniteQuery({
            queryKey: ["home-feed", p, 10],
            queryFn: ({ pageParam }) =>
              getUnifiedFeed({ ...p, limit: 10, page: pageParam as number }),
            initialPageParam: 1,
          });
        }),
        () => {
          const imageParams = { ...base, postType: "feed-images" as const };
          queryClient.prefetchInfiniteQuery({
            queryKey: ["home-images", imageParams, 20],
            queryFn: ({ pageParam }) =>
              getUnifiedFeed({ ...imageParams, limit: 20, page: pageParam as number }),
            initialPageParam: 1,
          });
        },
        () => {
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
        },
      ];

      jobs.forEach((job, i) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) job();
          }, i * PREFETCH_STEP_MS),
        );
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
      timers.forEach(clearTimeout);
    };
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
    // Only the chips that re-run the query arm the loader. postType is a pager
    // page turn — its destination list carries its own skeleton, and covering
    // the pager mid-slide would hide the very animation that answers the tap.
    const changesQuery =
      newFilters.sortBy !== filters.sortBy ||
      newFilters.dateRange !== filters.dateRange ||
      newFilters.contentAccess.length !== filters.contentAccess.length ||
      newFilters.contentAccess.some((a) => !filters.contentAccess.includes(a));
    if (changesQuery) filterTransition.begin();
    setFilters(newFilters);
  }, [filters, filterTransition]);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  const handleScrollBegin = useCallback(() => {
    setFilterPanelVisible(false);
  }, []);

  const handleCategorySelect = useCallback((category: string) => {
    const value = category === "All" ? undefined : category;
    filterTransition.begin();
    setSelectedCategory(value);
    try { storage.set("dehub:defaultCategory", value ?? ""); } catch {}
    setFilterPanelVisible(false);
  }, [filterTransition]);

  const handleRefresh = useCallback(() => {
    showHeader();
    refreshShuffleSeed();
  }, [showHeader, refreshShuffleSeed]);

  const handleLogoPress = useCallback(() => {
    showHeader();
    if (activeTabKey === "feed-images") {
      imageGridRef.current?.scrollToTopAndRefresh();
    } else if (activeTabKey === "short") {
      shortsGridRef.current?.scrollToTopAndRefresh();
    } else {
      feedRefs.current[activeTabKey as FeedListType]?.current?.scrollToTopAndRefresh();
    }
  }, [showHeader, activeTabKey]);

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
    filterTransition.begin();
    setSelectedCategory(undefined);
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
  }, [refreshShuffleSeed, filterTransition]);

  const handleCategoryPress = useCallback((cat: string) => {
    const value = cat === "All" ? undefined : cat;
    if (value === selectedCategory) return;
    filterTransition.begin();
    setSelectedCategory(value);
    try { storage.set("dehub:defaultCategory", value ?? ""); } catch {}
    if (!value) setFilters(DEFAULT_FILTERS);
  }, [selectedCategory, filterTransition]);

  const handleResetFilters = useCallback(() => {
    filterTransition.begin();
    setSelectedCategory(undefined);
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
    setFilterPanelVisible(false);
  }, [refreshShuffleSeed, filterTransition]);

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

  const renderPage = (key: TabKey, index: number) => {
    if (!visibleTabs.has(key)) return null;
    // `active` gates video playback, not visibility, so it rides the deferred
    // index — see deferredIndex above.
    const isPlaybackActive = index === deferredIndex;

    if (key === "feed-images") {
      return (
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
      );
    }

    if (key === "short") {
      return (
        <ShortsGrid
          gridRef={shortsGridRef}
          active={isPlaybackActive}
          params={feedParams}
          pageSize={20}
          headerInset={headerHeight}
          headerTranslateY={headerTranslateY}
          onRefresh={handleRefresh}
          onScrollBegin={handleScrollBegin}
          scrollHandler={scrollHandler}
          onScrollEnd={handleScrollEnd}
        />
      );
    }

    const feedType = key as FeedListType;
    return (
      <InfiniteVideoFeed
        feedRef={feedRefs.current[feedType]}
        active={isPlaybackActive}
        params={feedListParamsByType[feedType]}
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
    );
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <Animated.View style={[styles.headerClip, headerAnimatedStyle]} onLayout={onHeaderLayout}>
        <HomeHeader
          onLogoPress={handleLogoPress}
          onMenuPress={openDrawer}
        />

        <FeedNavBar
          activeIndex={activeIndex}
          progress={progress}
          isFilterOpen={filterPanelVisible}
          hasActiveFilters={hasActiveFilters}
          onPostTypeChange={setPostType}
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

      <GestureDetector gesture={pagerGesture}>
        <View style={styles.pagerViewport}>
          <PagerGestureProvider gestureRef={pagerGestureRef}>
            <Animated.View
              style={[styles.pagerRow, { width: pageWidth * TAB_ORDER.length }, pagerStyle]}
            >
              {TAB_ORDER.map((key, index) => (
                <View
                  key={key}
                  style={{ width: pageWidth }}
                  pointerEvents={index === activeIndex ? "auto" : "none"}
                >
                  {renderPage(key, index)}
                </View>
              ))}
            </Animated.View>
          </PagerGestureProvider>

          {/* Covers the pager, never the header: the filter panel and nav bar
              stay live so the user can keep adjusting while this is up. */}
          {filterTransition.active && <FeedFilterLoader topInset={headerHeight} />}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  // The row is six screens wide and slides under a clipped viewport, so the
  // five inactive pages are outside the visible bounds and cost no compositing.
  pagerViewport: { flex: 1, overflow: "hidden" },
  pagerRow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
  },
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
