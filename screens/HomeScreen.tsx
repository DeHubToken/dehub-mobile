import React, { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from "react";
import { Pressable, View, StyleSheet, InteractionManager, useWindowDimensions, type LayoutChangeEvent } from "react-native";
import { useSwipeBackAction } from '../hooks/useSwipeBack';
import { useBackPress } from "../hooks/useBackPress";
import { useTranslation } from "react-i18next";
import { useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  Easing,
  FadeInUp,
  FadeOutDown,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import { PagerGestureProvider } from "../context/PagerGestureContext";
import InfiniteVideoFeed, { type InfiniteVideoFeedHandle } from "../components/Home/InfiniteVideoFeed";
import LiveStagesBar from "../components/Home/LiveStagesBar";
import HomeImageGrid, { type HomeImageGridHandle } from "../components/Home/HomeImageGrid";
import ImageFeedDrawer, { type ImageFeedDrawerHandle } from "../components/Home/ImageFeedDrawer";
import ShortsGrid, { type ShortsGridHandle } from "../components/Home/ShortsGrid";
import MusicFeed, { type MusicFeedHandle } from "../components/Music/MusicFeed";
import CinematicMusic from "../components/Music/CinematicMusic";
import CinematicLive from "../components/Home/CinematicLive";
import { CINEMATIC_PHONE_MAX_WIDTH, useCinematicPhone } from "../hooks/useCinematicPhone";
import HomeHeader from "../components/HomeHeader";
import { IslandCapsule, IslandFeedMenu, ISLAND_BAR_HEIGHT, ISLAND_CAPSULE_GAP } from "../components/Home/IslandTopBar";
import NewPostsBead, { CHIP_GAP, CHIP_HEIGHT } from "../components/Home/NewPostsBead";
import { useNewPostsBead } from "../libs/new-posts-bead";
import FeedNavBar, { NAV_PILL_RADIUS, NAV_PILL_SIDE_INSET, NAV_PILL_TOP_INSET } from "../components/Home/FeedNavBar";
import { useDrawer } from "../context/DrawerContext";
import { useTabBarHide } from "../context/TabBarHideContext";
import FeedFilterPanel, { FeedFilters, PostTypeOption, FEED_FILTER_MAX_HEIGHT } from "../components/Home/FeedFilterPanel";
import { getCategoriesCached } from "../services/nft.service";
import { storage } from "../libs/storage";
import { feedDefaultsEvents, getAppFeedToggles, getDefaultFeedTab, setAppFeedToggles } from "../libs/feed-defaults";
import { useFeedDefaultsSync } from "../hooks/useFeedDefaultsSync";
import { homeTabEvents, promptFeedEvents } from "../libs/eventBus";
import { useCollapsibleHeader } from "../hooks/useCollapsibleHeader";
import { useAppPrefs } from "../hooks/useAppPrefs";
import { useShortsServerSync } from "../hooks/useShortsEnabled";
import { useFeedInterestsServerSync } from "../hooks/useFeedInterestsServerSync";
import { useHomePullRefresh } from '../hooks/useHomePullRefresh';
import FeedPillGlow from '../components/Home/FeedPillGlow';
import { HomePullRefreshContext } from '../context/HomePullRefreshContext';
import { useIsFetching } from "@tanstack/react-query";
import FeedFilterLoader from "../components/Home/FeedFilterLoader";
import { useFeedFilterTransition } from "../hooks/useFeedFilterTransition";
import type {
  FeedRange,
  FeedSortBy,
  FeedPostType,
  UnifiedFeedItem,
} from "../services/feed.unified.service";
import { TAB_BAR_CONTENT_INSET } from "../navigation/tabBarLayout";
import { tabPressIntentOf } from "../navigation/tabPressIntent";
import { ScreenNames } from "../navigation/ScreenNames";
import type { BottomTabParamList } from "../navigation/types";
import { isKidsModeLocked } from "../libs/kids-mode-lock";
import {
  useUserProfilePresentation,
  useUserProfileSheet,
} from "../context/UserProfileSheetContext";
import UserProfileBottomSheet from "../components/UserProfile/UserProfileBottomSheet";
import GettingStartedCard from "../components/Onboarding/GettingStartedCard";
import { pagerPageIntersectsViewport } from "../libs/pagerVisibility";
import { useAppTheme } from "../context/ThemeContext";
import { FrostedBackground, FrostedContent } from "../components/ui/FrostedBackdrop";
import StatusBarFrost from "../components/ui/StatusBarFrost";
import { holdThemeBackdrop } from "../libs/themeBackdrop";
import { useAuthActions, useAuthState } from "../context/AuthContext";
import FollowTagBar from "../components/Home/FollowTagBar";
import { setFeedPostHost } from "../libs/feedPostHost";

// The post page Home opens in place. Required on first use so the screen's
// code stays off Home's first render, the same as its stack route.
let FeedDetailEmbeddedImpl: typeof import("./FeedDetailScreen").FeedDetailEmbedded | null = null;
function FeedPostSurface(props: { tokenId: string; onClose: () => void; bottomInset: number }) {
  FeedDetailEmbeddedImpl ??= require("./FeedDetailScreen").FeedDetailEmbedded;
  const Impl = FeedDetailEmbeddedImpl!;
  return <Impl {...props} />;
}
/** Phones only, the width the post page uses its phone layout under. */
const FEED_POST_MAX_WIDTH = 640;

const FALLBACK_CATEGORIES: string[] = [];
const SHUFFLE_SEED_EXPIRY_MS = 30 * 60 * 1000;
const SEED_CHECK_INTERVAL_MS = 60_000;

const generateShuffleSeed = () => String(Date.now());

const CATEGORY_STORAGE_KEY = "dehub:defaultCategory";

/** The category outlives the session, so resetting filters has to clear it. */
const clearPersistedCategory = () => {
  try { storage.set(CATEGORY_STORAGE_KEY, ""); } catch {}
};

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
// Indexed against FeedNavBar's NAV_ITEMS — the two must stay in the same order,
// which is also web's FEED_TABS order.
// Settings > Content can turn Shorts off, which drops its tab (web hides it the
// same way); the component then works from TAB_ORDER_NO_SHORTS.
const ALL_TAB_ORDER = ["all", "short", "feed-images", "video", "feed-audio", "live"] as const;
type TabKey = (typeof ALL_TAB_ORDER)[number];
const TAB_ORDER_NO_SHORTS: readonly TabKey[] = ALL_TAB_ORDER.filter((key) => key !== "short");

// Keep the slot and React state, but draw a page only while it intersects the
// pager viewport. Idle neighbours otherwise retain hundreds of GPU textures
// throughout vertical scrolling. Progress also reveals both sides of a swipe
// and every intermediate page of a tab animation on the UI thread.
function PagerPage({ index, progress, children }: {
  index: number;
  progress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    display: pagerPageIntersectsViewport(index, progress.value) ? 'flex' : 'none',
  }));
  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}

// The four tabs served by InfiniteVideoFeed (images and shorts have their own
// grid components). Each gets its own kept-mounted list so switching never
// re-creates a FlatList.
const FEED_LIST_TYPES = ["all", "video", "live"] as const;

// Live stages sit at the top of every list feed, for everyone. One element for
// the life of the app so InfiniteVideoFeed's memoised list header never churns.
const LIVE_STAGES_HEADER = <LiveStagesBar />;
type FeedListType = (typeof FEED_LIST_TYPES)[number];

// Page-turn animation. Short and front-loaded: the page should be visibly
// settling by the time the finger leaves the glass.
const PAGE_ANIM = { duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1) } as const;
// How far past the first/last tab a drag is allowed to pull, as a fraction of
// the real distance — the give is what tells you there is nothing beyond.
const EDGE_RESISTANCE = 0.28;
/** Travel before a drag is judged a page turn or a feed scroll, in points. */
const PAGE_TURN_DECIDE_PX = 14;
/**
 * A page turn must be at least this many times more sideways than vertical.
 * A thumb's upward flick starts with a sideways drift; with plain 14pt offsets
 * that drift reached the X threshold first and flipped the tab mid-scroll.
 */
const PAGE_TURN_RATIO = 2;
// Seconds of flick velocity folded into the release position, so a fast short
// swipe turns the page instead of snapping back. Waiting for half a screen of
// travel is precisely what read as slow.
const VELOCITY_PROJECTION = 0.12;

/**
 * The filters Home opens with: the viewer's default tab (Settings > Appearance)
 * and the toggles they left on (libs/feed-defaults), else the stock defaults.
 */
const savedFilters = (): FeedFilters => {
  const saved = getAppFeedToggles();
  return {
    ...DEFAULT_FILTERS,
    postType: getDefaultFeedTab(),
    ...(saved.sortBy ? { sortBy: saved.sortBy as FeedFilters["sortBy"] } : null),
    ...(saved.dateRange !== undefined ? { dateRange: saved.dateRange as FeedFilters["dateRange"] } : null),
    ...(saved.contentAccess ? { contentAccess: saved.contentAccess as FeedFilters["contentAccess"] } : null),
  };
};

/**
 * Pager slot for a post type. Filter-panel-only types ("feed-simple") have no
 * tab of their own, so they render in the Home slot — previously they matched
 * no list at all and left the screen blank.
 */
const indexForPostType = (postType: PostTypeOption, tabOrder: readonly TabKey[]): number => {
  const i = tabOrder.indexOf(postType as TabKey);
  return i >= 0 ? i : 0;
};

/**
 * Payload for the image drawer. Held here rather than in the grid because the
 * drawer has to be a sibling of the header — it hangs off the bottom of it and
 * must not be clipped by, or paint over, the nav bar.
 */
type ImageFeedRequest = {
  items: UnifiedFeedItem[];
  index: number;
  /** Remount key, so re-opening always starts a fresh sheet at the new post. */
  token: number;
};

/** How far the chip travels to sit fully behind the pill. */
const CHIP_TUCK = CHIP_GAP + CHIP_HEIGHT + 2;
/** The drawer pulls out from under the pill, and slides back in. */
const beadEnter = () => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: -CHIP_TUCK }] },
    animations: { transform: [{ translateY: withSpring(0, { damping: 20, stiffness: 240, mass: 0.8 }) }] },
  };
};
const beadExit = () => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: 0 }] },
    animations: { transform: [{ translateY: withTiming(-CHIP_TUCK, { duration: 170, easing: Easing.in(Easing.quad) }) }] },
  };
};

export default function HomeScreen() {
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [imageFeed, setImageFeed] = useState<ImageFeedRequest | null>(null);
  // A text, image or audio post opened in place: Home's logo bar and pill stay
  // exactly where they are and the pill's filter slot becomes Back.
  const [feedPost, setFeedPost] = useState<string | null>(null);
  const imageFeedToken = useRef(0);
  const [filters, setFilters] = useState<FeedFilters>(savedFilters);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(undefined);
  const { width: pageWidth, height: pageHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { skin, theme, colors } = useAppTheme();
  const { t } = useTranslation();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  // System floats its glass pill over the feed like the canvas themes do, so
  // it gets the same clear header and the same cut around the pill.
  const glassNav = !!skin || theme === "system" || theme === "immersive";
  // Immersive's island: the whole top bar is one small capsule, with nothing
  // painted around it, that slides away on a scroll down and back on a
  // scroll up like the old bar; the feed runs under it to the top
  // of the screen. Its chevron opens a feed menu rather than the tab pill;
  // the pill only comes back for a sub-view's back slot.
  const island = theme === "immersive" && !skin;
  // Phones only (web's useCinematicPhone): the Music and Live tabs' own layouts.
  const cinematicPhone = useCinematicPhone();
  const [islandMenuOpen, setIslandMenuOpen] = useState(false);
  const { hideUserProfile } = useUserProfileSheet();
  const {
    profileVisible,
    profileIdentifier,
    profilePresentation,
    setFeedProfileHostActive,
  } = useUserProfilePresentation();
  const feedProfileVisible =
    profileVisible && profilePresentation === "feed" && !!profileIdentifier;

  // Only the focused Home tab may claim profile opens for the persistent feed
  // surface. Other screens keep the standalone profile presentation.
  useEffect(() => {
    setFeedProfileHostActive(isFocused);
    return () => setFeedProfileHostActive(false);
  }, [isFocused, setFeedProfileHostActive]);

  useEffect(() => {
    if (!isFocused && feedProfileVisible) hideUserProfile();
  }, [feedProfileVisible, hideUserProfile, isFocused]);

  // Load persisted category on mount (MMKV is sync — no async race). The
  // account's saved toggles win over this device's last category.
  useEffect(() => {
    try {
      const val = getAppFeedToggles().category ?? storage.getString(CATEGORY_STORAGE_KEY);
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
    live: { current: null },
  });
  const imageGridRef = useRef<HomeImageGridHandle | null>(null);
  const shortsGridRef = useRef<ShortsGridHandle | null>(null);
  const musicFeedRef = useRef<MusicFeedHandle | null>(null);
  // Published to the page tree so horizontally-scrolling descendants (image
  // galleries, the suggestions carousel) can block the page turn while they are
  // scrolling — see PagerGestureContext.
  const pagerGestureRef = useRef<GestureType | undefined>(undefined);
  // The same page turn, started on the Images scroll view that covers the pager.
  const drawerPagerRef = useRef<GestureType | undefined>(undefined);

  useShortsServerSync();
  useFeedInterestsServerSync();
  const { shorts: shortsEnabled } = useAppPrefs();
  const TAB_ORDER: readonly TabKey[] = shortsEnabled ? ALL_TAB_ORDER : TAB_ORDER_NO_SHORTS;
  const LAST_INDEX = TAB_ORDER.length - 1;
  const activeIndex = indexForPostType(filters.postType, TAB_ORDER);
  const activeTabKey = TAB_ORDER[activeIndex];
  // Starting and stopping video playback is the expensive half of a tab switch
  // and none of it is on screen yet — the pager translate already moved. Let it
  // ride a deferred value so the tap itself never waits on it.
  const deferredIndex = useDeferredValue(activeIndex);

  // Pages mount on first approach and stay mounted. Keep unvisited pages out
  // of startup work, matching web's navigation-intent loading. PagerPage
  // controls drawing while preserving each visited list's state.
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
  }, [mountedTabs, activeIndex, TAB_ORDER, LAST_INDEX]);

  useEffect(() => {
    if (visibleTabs.size !== mountedTabs.size) setMountedTabs(visibleTabs);
  }, [visibleTabs, mountedTabs]);

  const {
    translateY: headerTranslateY,
    scrollOffset,
    headerHeight,
    headerAnimatedStyle,
    onHeaderLayout,
    scrollHandler,
    handleScrollEnd,
    showHeader,
  } = useCollapsibleHeader();
  // Every theme pulls the feed down itself (not the native spinner), so the
  // pill can glow with the pull as the immersive capsule does.
  // Any phone, any theme: useCinematicPhone is Immersive-only.
  const phone = Math.min(pageWidth, pageHeight) <= CINEMATIC_PHONE_MAX_WIDTH;
  const homePull = useHomePullRefresh(phone && isFocused && !islandMenuOpen && !filterPanelVisible && !feedProfileVisible && !imageFeed && !feedPost, scrollOffset, activeIndex);
  const pullDistance = homePull.motion.distance;

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
    // "Following" is Latest narrowed to followed creators, as on web.
    const following = filters.sortBy === "following";
    const params: Record<string, any> = {
      category: selectedCategory,
      sortBy: (following ? "createdAt" : filters.sortBy) as FeedSortBy,
      sortOrder: "desc" as const,
      status: "all" as const,
    };

    if (following) params.followingOnly = true;
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
      ALL_TAB_ORDER.includes(filters.postType as TabKey)
        ? undefined
        : (filters.postType as FeedPostType),
    [filters.postType],
  );

  // Each feed list has a hard-wired postType and its own stable query key.
  const feedListParamsByType = useMemo(() => {
    return {
      all: homeSlotPostType ? { ...feedParams, postType: homeSlotPostType } : feedParams,
      video: { ...feedParams, postType: "video" as const },
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
  const pagerTouch = useSharedValue({ x: 0, y: 0, decided: false });
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
    // Changing tab is the one dismissal that skips the slide-out: the drawer is
    // covering the page the tap is asking for, so it has to be gone this frame.
    setImageFeed(null);
    setFilters((prev) => (prev.postType === postType ? prev : { ...prev, postType }));
  }, []);

  const handleNavPostTypeChange = useCallback(
    (postType: PostTypeOption) => {
      if (feedProfileVisible) hideUserProfile();
      setFeedPost(null);
      setPostType(postType);
    },
    [feedProfileVisible, hideUserProfile, setPostType],
  );

  const handleOpenImageFeed = useCallback(
    (index: number, items: UnifiedFeedItem[]) => {
      // The sheet rests against the bottom of the header, so the header has to
      // be down before it opens — otherwise it docks to a bar that isn't there.
      showHeader();
      setFilterPanelVisible(false);
      imageFeedToken.current += 1;
      setImageFeed({ items, index, token: imageFeedToken.current });
    },
    [showHeader],
  );

  const handleCloseImageFeed = useCallback(() => setImageFeed(null), []);

  const closeFeedPost = useCallback(() => setFeedPost(null), []);
  // A profile (in place or in its own sheet) covers the feed. Its cards' comment
  // buttons must keep their own sheet: a post opened in place here would sit
  // under the profile, and its comments sheet came up as an invisible window
  // that took every touch, so the app looked frozen.
  const profileVisibleRef = useRef(profileVisible);
  profileVisibleRef.current = profileVisible;
  useEffect(() => {
    if (!isFocused || pageWidth >= FEED_POST_MAX_WIDTH) return;
    setFeedPostHost((tokenId, options) => {
      if (options?.comments && profileVisibleRef.current) return false;
      showHeader();
      setFilterPanelVisible(false);
      setImageFeed(null);
      setFeedPost(tokenId);
      return true;
    });
    return () => setFeedPostHost(null);
  }, [isFocused, pageWidth, showHeader]);
  // The edge swipe is the same Back as the pill's arrow and the system back.
  useSwipeBackAction(closeFeedPost, !!feedPost && !feedProfileVisible);
  useBackPress(closeFeedPost, !!feedPost && !feedProfileVisible);

  // The nav bar's back arrow asks the sheet to slide out first; unmounting it
  // straight away would make the one deliberate control the only abrupt exit.
  const imageDrawerRef = useRef<ImageFeedDrawerHandle>(null);
  const handleImageFeedBack = useCallback(() => {
    if (imageDrawerRef.current) imageDrawerRef.current.close();
    else setImageFeed(null);
  }, []);
  useSwipeBackAction(handleImageFeedBack, !!imageFeed && !feedProfileVisible);

  useEffect(() => {
    if (!feedProfileVisible) return;
    showHeader();
    setFilterPanelVisible(false);
    setImageFeed(null);
  }, [feedProfileVisible, showHeader]);

  useBackPress(hideUserProfile, feedProfileVisible);

  // The filter panel is an in-tree overlay, not a Modal, so Android back would
  // otherwise skip it and leave the app. Close the panel first.
  const closeFilterPanel = useCallback(() => setFilterPanelVisible(false), []);
  useSwipeBackAction(closeFilterPanel, filterPanelVisible && !feedProfileVisible);
  useBackPress(closeFilterPanel, filterPanelVisible && !feedProfileVisible);

  // Called from the UI thread once a drag has picked its landing page. The
  // animation is already running by then; this only catches React up.
  const commitIndex = useCallback(
    (index: number) => {
      animatedToRef.current = index;
      setPostType(TAB_ORDER[index]);
    },
    [setPostType, TAB_ORDER],
  );

  // 1 while a page turn that started on the Images scroll view is in flight:
  // the pager under it shows, and the sheet slides with the Images page.
  const drawerSwipe = useSharedValue(0);
  const buildPageTurn = useCallback(
    (ref: React.MutableRefObject<GestureType | undefined>, fromDrawer: boolean) =>
      Gesture.Pan()
        // Horizontal intent only: a vertical drag belongs to the feed's own
        // scroll view and must never be stolen by the pager.
        // Decided by angle, not by which axis crosses 14pt first: only a
        // clearly sideways drag turns the page.
        .manualActivation(true)
        .maxPointers(1)
        .withRef(ref)
        .onTouchesDown((event, manager) => {
          const point = event.allTouches[0];
          if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
          pagerTouch.value = { x: point.absoluteX, y: point.absoluteY, decided: false };
        })
        .onTouchesMove((event, manager) => {
          const origin = pagerTouch.value;
          if (origin.decided) return;
          const point = event.allTouches[0];
          if (!point || event.numberOfTouches !== 1) { manager.fail(); return; }
          const dx = Math.abs(point.absoluteX - origin.x);
          const dy = Math.abs(point.absoluteY - origin.y);
          if (Math.max(dx, dy) < PAGE_TURN_DECIDE_PX) return;
          pagerTouch.value = { ...origin, decided: true };
          if (dx >= dy * PAGE_TURN_RATIO) manager.activate();
          else manager.fail();
        })
        .onStart(() => {
          cancelAnimation(progress);
          dragStart.value = progress.value;
          if (fromDrawer) drawerSwipe.value = 1;
          // The header hides on the vertical scroll of the page being left.
          // Carried hidden into the next page, that page's top spacer shows as
          // a blank band above its first post, so a page turn brings it back.
          runOnJS(showHeader)();
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
          if (!fromDrawer) {
            progress.value = withTiming(target, PAGE_ANIM);
            if (target !== from) runOnJS(commitIndex)(target);
            return;
          }
          // Off the Images scroll view the tab changes once the sheet has slid
          // away; changing tab closes it, and closing it mid-slide would swap
          // the sheet for the grid under it.
          progress.value = withTiming(target, PAGE_ANIM, (finished) => {
            if (finished && target !== from) runOnJS(commitIndex)(target);
            else drawerSwipe.value = 0;
          });
        }),
    [pageWidth, commitIndex, progress, dragStart, pagerTouch, showHeader, LAST_INDEX, drawerSwipe],
  );
  const pagerGesture = useMemo(() => buildPageTurn(pagerGestureRef, false), [buildPageTurn]);
  // Single photos and text on the Images scroll view turn the tab like the
  // feed does; galleries in it block this through PagerGestureProvider.
  const drawerPagerGesture = useMemo(() => buildPageTurn(drawerPagerRef, true), [buildPageTurn]);
  useEffect(() => { if (!imageFeed) drawerSwipe.value = 0; }, [imageFeed, drawerSwipe]);
  const drawerRevealStyle = useAnimatedStyle(() => ({ opacity: drawerSwipe.value }));
  const drawerSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerSwipe.value ? (dragStart.value - progress.value) * pageWidth : 0 }],
  }));
  const homeGestures = useMemo(() => Gesture.Race(pagerGesture, homePull.gesture), [pagerGesture, homePull.gesture]);

  // Canvas themes draw the header translucent over the live backdrop, and
  // Android has no backdrop blur to soften what scrolls under it, so posts
  // showed sharp behind the avatar, logo and bell. Web's glass themes cut the
  // feed off at the top edge of the nav pill instead; this does the same. The
  // viewport slides down to the pill's top and its content slides back up by
  // the same amount: two transforms on the UI thread, no layout per frame.
  const navPillTop = useSharedValue(0);
  const navPillBottom = useSharedValue(0);
  const [pillTopInHeader, setPillTopInHeader] = useState(0);
  const [navOverlap, setNavOverlap] = useState(38);
  const [pillBottom, setPillBottom] = useState(0);
  const onNavLayout = useCallback((e: LayoutChangeEvent) => {
    setNavOverlap(e.nativeEvent.layout.height - NAV_PILL_TOP_INSET);
    setPillTopInHeader(e.nativeEvent.layout.y + NAV_PILL_TOP_INSET + 4);
    // Match web's full-width cutoff below the rounded top corners, so nothing
    // peeks past them on any tab. Both layers follow the header on the UI
    // thread, even while JavaScript is busy.
    navPillTop.value = e.nativeEvent.layout.y + NAV_PILL_TOP_INSET + NAV_PILL_RADIUS;
    // Minimal's tab bar sits flush; the pill themes keep 2pt under the pill.
    navPillBottom.value = e.nativeEvent.layout.y + e.nativeEvent.layout.height - (theme === 'minimal' ? 0 : 2);
    setPillBottom(navPillBottom.value);
  }, [navPillTop, navPillBottom, theme]);
  const clipOn = glassNav && !island;
  const feedClipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: clipOn ? Math.max(0, navPillTop.value + headerTranslateY.value) : 0 }],
  }));
  const feedUnclipStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (clipOn ? -Math.max(0, navPillTop.value + headerTranslateY.value) : 0) + pullDistance.value }],
  }));

  // Under the island nothing is reserved for the capsule: the home feed
  // starts at the top of the screen and its first row makes room under the
  // capsule itself (firstRowInset). Media grids start behind the capsule like
  // the video feed. The tab pill, when open, hangs over the
  // feed rather than pushing it down, and the capsule slides away and back
  // with the same scroll signal the old header used.
  // Where the clear header lets the feed show (its cut across the pill's
  // middle), an open post starts at that same cut, so the hidden feed can't
  // peek through the gap between the pill and the post.
  const postSurfaceTop = clipOn && pillTopInHeader > 0
    ? Math.min(headerHeight, pillTopInHeader - 4 + NAV_PILL_RADIUS)
    : headerHeight;
  const feedInset = island ? ISLAND_BAR_HEIGHT : headerHeight;
  const mediaGridInset = island ? 0 : headerHeight;
  const postFeedInset = island ? 0 : headerHeight;
  const postFeedFirstRowInset = island ? ISLAND_BAR_HEIGHT + 4 : 0;
  const showNavPill = !island || feedProfileVisible || !!imageFeed || !!feedPost;
  const newPostsBead = useNewPostsBead();
  // The pill's bottom edge. The chip's window starts there, so anything above
  // it is behind the pill.
  const beadTop = island ? ISLAND_BAR_HEIGHT - ISLAND_CAPSULE_GAP : pillBottom;
  // Dual hide: as the pill starts to hide, the drawer slides back under it
  // first; once the pill is back, the drawer waits a beat and pulls back out.
  const chipTuck = useSharedValue(0);
  useAnimatedReaction(
    () => headerTranslateY.value < -1,
    (hiding, was) => {
      if (hiding === was) return;
      chipTuck.value = hiding
        ? withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) })
        : withDelay(180, withSpring(0, { damping: 20, stiffness: 240, mass: 0.8 }));
    },
  );
  const chipTuckStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -CHIP_TUCK * chipTuck.value }],
  }));
  const showBead = isFocused && !filterPanelVisible && !feedProfileVisible && !imageFeed && !feedPost
    && !(island && islandMenuOpen);
  // A scroll that hides the capsule puts its menu away too (a touch on the
  // feed already does, through handleScrollBegin).
  useAnimatedReaction(
    () => headerTranslateY.value < 0,
    (hiding, was) => {
      if (island && hiding && !was) runOnJS(setIslandMenuOpen)(false);
    },
    [island],
  );
  // The capsule's middle opens and closes the feed menu; opening it puts an
  // open filter panel away.
  const toggleIslandMenu = useCallback(() => {
    setIslandMenuOpen((open) => !open);
    setFilterPanelVisible(false);
  }, []);
  const closeIslandMenu = useCallback(() => setIslandMenuOpen(false), []);

  useSwipeBackAction(closeIslandMenu, islandMenuOpen && !feedProfileVisible);

  useBackPress(closeIslandMenu, islandMenuOpen);
  // A pick switches feeds exactly as the pill's buttons did.
  const handleIslandSelect = useCallback((index: number) => {
    setIslandMenuOpen(false);
    handleNavPostTypeChange(TAB_ORDER[index]);
  }, [handleNavPostTypeChange, TAB_ORDER]);
  const handleIslandFilters = useCallback(() => {
    setIslandMenuOpen(false);
    setFilterPanelVisible(true);
  }, []);

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
  // Destructured, never held as an object: useIsFetching re-renders this screen
  // on every fetch transition, and `begin` is the only stable half. The six
  // pager pages are memo()'d precisely so they do not re-render with the shell,
  // so any handler passed down to them must depend on `begin` alone — depending
  // on the whole object gave every one of them a fresh identity per render and
  // re-rendered all six video lists on every tick.
  const { active: filterLoaderActive, begin: beginFilterTransition } =
    useFeedFilterTransition(feedQueriesInFlight > 0);

  // ── Navigation ───────────────────────────────────────────────────────────
  const tabNavigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const homeRoute = useRoute<RouteProp<BottomTabParamList, typeof ScreenNames.Home>>();

  // A post page keeps this feed\'s pill. Its tabs pop to this existing Home,
  // then apply the requested feed, rather than stacking a second tab navigator.
  useEffect(() => {
    const requested = homeRoute.params?.feedTab;
    if (!requested) return;
    const next = TAB_ORDER.includes(requested as TabKey) ? requested : "all";
    handleNavPostTypeChange(next);
    setFilterPanelVisible(!!homeRoute.params?.openFeedFilters);
    showHeader();
    tabNavigation.setParams({ feedTab: undefined, openFeedFilters: undefined });
  }, [homeRoute.params?.feedTab, homeRoute.params?.openFeedFilters, TAB_ORDER, handleNavPostTypeChange, showHeader, tabNavigation]);

  // Each pager page mounts on its first visit. Gesture handlers select the
  // intended page before the animation commits; hidden screens do no boot work.

  const hasActiveFilters = useMemo(() => {
    return (
      filters.sortBy !== DEFAULT_FILTERS.sortBy ||
      filters.dateRange !== DEFAULT_FILTERS.dateRange ||
      filters.contentAccess.length > 0 ||
      !!selectedCategory
    );
  }, [filters, selectedCategory]);

  const applyFilters = useCallback((newFilters: FeedFilters) => {
    // Only the chips that re-run the query arm the loader. postType is a pager
    // page turn — its destination list carries its own skeleton, and covering
    // the pager mid-slide would hide the very animation that answers the tap.
    const changesQuery =
      newFilters.sortBy !== filters.sortBy ||
      newFilters.dateRange !== filters.dateRange ||
      newFilters.contentAccess.length !== filters.contentAccess.length ||
      newFilters.contentAccess.some((a) => !filters.contentAccess.includes(a));
    if (changesQuery) beginFilterTransition();
    setFilters(newFilters);
  }, [filters, beginFilterTransition]);

  // The Following feed is personal, so a signed-out tap asks for sign-in
  // first and lands on the feed once it succeeds.
  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    if (newFilters.sortBy === "following" && filters.sortBy !== "following" && !isSignedIn) {
      setFilterPanelVisible(false);
      requireAuth(() => {
        beginFilterTransition();
        setFilters((prev) => ({ ...prev, sortBy: "following" }));
      });
      return;
    }
    applyFilters(newFilters);
  }, [filters.sortBy, isSignedIn, requireAuth, applyFilters, beginFilterTransition]);

  // Signing out leaves nobody to follow: fall back to the default sort.
  useEffect(() => {
    if (!isSignedIn && filters.sortBy === "following") {
      setFilters((prev) => ({ ...prev, sortBy: DEFAULT_FILTERS.sortBy }));
    }
  }, [isSignedIn, filters.sortBy]);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  const handleScrollBegin = useCallback(() => {
    setFilterPanelVisible(false);
    // Moving the feed puts the capsule's menu away.
    setIslandMenuOpen(false);
    holdThemeBackdrop();
  }, []);

  const handleCategorySelect = useCallback((category: string) => {
    const value = category === "All" ? undefined : category;
    beginFilterTransition();
    setSelectedCategory(value);
    try { storage.set(CATEGORY_STORAGE_KEY, value ?? ""); } catch {}
    setFilterPanelVisible(false);
  }, [beginFilterTransition]);

  // One hashtag picked — where a tapped #tag lands: offer to follow it above
  // the feed (FollowTagBar). Otherwise the header is just the stages bar.
  const feedHeader = useMemo(
    () =>
      selectedCategory ? (
        <>
          <FollowTagBar tag={selectedCategory} onClear={() => handleCategorySelect("All")} />
          {LIVE_STAGES_HEADER}
        </>
      ) : (
        LIVE_STAGES_HEADER
      ),
    [selectedCategory, handleCategorySelect],
  );

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
    } else if (activeTabKey === "feed-audio") {
      musicFeedRef.current?.scrollToTop();
    } else {
      feedRefs.current[activeTabKey as FeedListType]?.current?.scrollToTopAndRefresh();
    }
  }, [showHeader, activeTabKey]);

  // The Home button in the bottom bar, pressed while Home is showing another
  // feed (Shorts, Images, Videos, Music, Live): back to the Home feed, at its
  // top. On the Home feed itself the list's own listener scrolls up and, on a
  // second press, refreshes.
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  useEffect(() => {
    return tabNavigation.addListener("tabPress", (event) => {
      if (tabPressIntentOf(event) === "navigate") return;
      if (activeIndexRef.current === 0) return;
      setIslandMenuOpen(false);
      showHeader();
      handleNavPostTypeChange("all");
      feedRefs.current.all?.current?.scrollToTop();
    });
  }, [tabNavigation, showHeader, handleNavPostTypeChange]);

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
    beginFilterTransition();
    setSelectedCategory(undefined);
    clearPersistedCategory();
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
  }, [refreshShuffleSeed, beginFilterTransition]);

  const handleCategoryPress = useCallback((cat: string) => {
    const value = cat === "All" ? undefined : cat;
    if (value === selectedCategory) return;
    beginFilterTransition();
    setSelectedCategory(value);
    try { storage.set(CATEGORY_STORAGE_KEY, value ?? ""); } catch {}
    if (!value) setFilters(DEFAULT_FILTERS);
  }, [selectedCategory, beginFilterTransition]);

  // Leaves the panel open, so the pills visibly snap back to their defaults
  // instead of the panel vanishing with no sign anything happened (web does the
  // same). Clearing the persisted category matters too: without it the category
  // comes straight back on the next launch, which reads as a reset that didn't
  // take.
  const handleResetFilters = useCallback(() => {
    beginFilterTransition();
    setSelectedCategory(undefined);
    clearPersistedCategory();
    setFilters(DEFAULT_FILTERS);
    refreshShuffleSeed();
  }, [refreshShuffleSeed, beginFilterTransition]);

  // PromptScreen tunes the feed on a separate route, and this screen only reads
  // the persisted category on mount — so the result arrives over the event bus
  // rather than through MMKV, which would otherwise only apply next cold start.
  useEffect(
    () =>
      promptFeedEvents.onCategoryChosen((category) => {
        beginFilterTransition();
        setSelectedCategory(category);
        if (!category) setFilters(DEFAULT_FILTERS);
      }),
    [beginFilterTransition],
  );

  useEffect(() => homeTabEvents.setVisibleTab(activeTabKey), [activeTabKey]);

  // Toggles the viewer sets stay as their defaults until they reset them.
  // Post type is the tab, not a toggle; the default tab is its own setting.
  const categoryLoadedRef = useRef(false);
  useEffect(() => {
    // The first pass runs before the persisted category is read back.
    if (!categoryLoadedRef.current) { categoryLoadedRef.current = true; return; }
    setAppFeedToggles({
      sortBy: filters.sortBy,
      dateRange: filters.dateRange,
      contentAccess: filters.contentAccess,
      category: selectedCategory,
    });
  }, [filters.sortBy, filters.dateRange, filters.contentAccess, selectedCategory]);

  // Saved toggles changed elsewhere (reset in Settings, or the account's
  // arriving on sign-in): put the feed on them.
  const applySavedToggles = useCallback(() => {
    const saved = getAppFeedToggles();
    const next = savedFilters();
    setFilters((prev) => {
      const same =
        prev.sortBy === next.sortBy &&
        prev.dateRange === next.dateRange &&
        prev.contentAccess.length === next.contentAccess.length &&
        prev.contentAccess.every((a) => next.contentAccess.includes(a));
      return same ? prev : { ...prev, sortBy: next.sortBy, dateRange: next.dateRange, contentAccess: next.contentAccess };
    });
    setSelectedCategory(saved.category);
    try { storage.set(CATEGORY_STORAGE_KEY, saved.category ?? ""); } catch {}
  }, []);
  useEffect(() => feedDefaultsEvents.subscribe(applySavedToggles), [applySavedToggles]);
  useFeedDefaultsSync(applySavedToggles);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setCategoriesLoading(true);
      const list = await getCategoriesCached();
      if (mounted && list?.length) {
        const cleaned = list.filter((c) => c && c.toLowerCase() !== "all");
        setCategories(cleaned);
        // Read through the updater rather than the closure. This effect runs
        // once, and the effect that restores the persisted category runs before
        // it — so the `selectedCategory` captured here was always the initial
        // `undefined`, and a persisted category the backend has since dropped
        // was never cleared. The feed then filtered on a dead category with no
        // sign of why it was empty.
        setSelectedCategory((current) =>
          current && !cleaned.includes(current) ? undefined : current,
        );
      }
      if (mounted) setCategoriesLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const renderPage = (key: TabKey, index: number) => {
    if (!visibleTabs.has(key)) return null;
    // `active` gates video playback, not visibility, so it rides the deferred
    // index — see deferredIndex above.
    const isPlaybackActive = index === deferredIndex && !profileVisible && !feedPost;

    if (key === "feed-images") {
      return (
        <HomeImageGrid
          active={isPlaybackActive}
          gridRef={imageGridRef}
          params={feedParams}
          pageSize={20}
          headerInset={mediaGridInset}
          onRefresh={handleRefresh}
          onScrollBegin={handleScrollBegin}
          scrollHandler={scrollHandler}
          onScrollEnd={handleScrollEnd}
          onOpenImageFeed={handleOpenImageFeed}
        />
      );
    }

    // The Audio tab is a browse surface, not a list of audio posts. It used to
    // be the plain `feed-audio` feed, which is why it read as nothing but voice
    // recordings while web's Music tab carried shelves of videos, radio, audio
    // uploads and live stages.
    if (key === "feed-audio") {
      // System theme on phones: web's radio hero and chart (CinematicMusic).
      if (cinematicPhone) {
        return (
          <CinematicMusic
            active={isPlaybackActive}
            feedRef={musicFeedRef}
            scrollHandler={scrollHandler}
            onScrollBegin={handleScrollBegin}
            onScrollEnd={handleScrollEnd}
            onRefresh={handleRefresh}
          />
        );
      }
      return (
        <MusicFeed
          active={isPlaybackActive}
          feedRef={musicFeedRef}
          headerInset={feedInset}
          scrollHandler={scrollHandler}
          onScrollBegin={handleScrollBegin}
          onScrollEnd={handleScrollEnd}
          onRefresh={handleRefresh}
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
          headerInset={mediaGridInset}
          onRefresh={handleRefresh}
          onScrollBegin={handleScrollBegin}
          scrollHandler={scrollHandler}
          onScrollEnd={handleScrollEnd}
        />
      );
    }

    const feedType = key as FeedListType;
    // System theme on phones: who is live, the top games and a grid of
    // streams (CinematicLive) instead of the list of live posts.
    if (feedType === "live" && cinematicPhone) {
      return (
        <CinematicLive
          feedRef={feedRefs.current.live}
          active={isPlaybackActive}
          scrollHandler={scrollHandler}
          onScrollBegin={handleScrollBegin}
          onScrollEnd={handleScrollEnd}
          onRefresh={handleRefresh}
        />
      );
    }
    return (
      <InfiniteVideoFeed
        feedRef={feedRefs.current[feedType]}
        active={isPlaybackActive}
        params={feedListParamsByType[feedType]}
        showShortsCarousel={feedType === "all"}
        showPendingPost={feedType === "all"}
        answersTabPress={feedType === "all"}
        pageSize={20}
        headerInset={postFeedInset}
        firstRowInset={postFeedFirstRowInset}
        hideNewPosts={islandMenuOpen}
        onRefresh={handleRefresh}
        onScrollBegin={handleScrollBegin}
        scrollHandler={scrollHandler}
        onScrollEnd={handleScrollEnd}
        onCategorySelect={handleCategorySelect}
        onRetry={handleRetry}
        onClearFilters={handleClearFilters}
        // The boost slot belongs on the main mixed feed only. "video" and
        // "live" are somebody asking for one format, and a boosted text post
        // arriving at the top of those reads as a bug rather than as a boost.
        showBoostSlot={feedType === "all"}
        headerComponent={feedHeader}
      />
    );
  };

  const filterPanel = (
    <FeedFilterPanel
      visible={!feedProfileVisible && filterPanelVisible}
      filters={filters}
      onFiltersChange={handleFiltersChange}
      categories={categories}
      selectedCategory={selectedCategory}
      onCategoryPress={handleCategoryPress}
      onResetFilters={handleResetFilters}
      showFollowingSort
      navOverlap={theme === 'system' ? navOverlap : undefined}
      chipRadius={theme === 'system' ? 8 : undefined}
    />
  );

  return (
    <View className="flex-1">
      {(island && islandMenuOpen) || (theme === 'system' && filterPanelVisible) ? (
        // A tap anywhere outside the menu closes it, and does nothing else.
        <Pressable
          style={styles.menuScrim}
          onPress={island ? closeIslandMenu : () => setFilterPanelVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        />
      ) : null}
      <FrostedContent>
      <GestureDetector gesture={homeGestures}>
        <Animated.View
          pointerEvents={imageFeed ? "none" : "auto"}
          accessibilityElementsHidden={!!imageFeed}
          importantForAccessibility={imageFeed ? "no-hide-descendants" : "auto"}
          style={[styles.pagerViewport, feedClipStyle, imageFeed ? drawerRevealStyle : null]}
        >
          <Animated.View style={[styles.feedUnclip, feedUnclipStyle]}>
          <PagerGestureProvider gestureRef={pagerGestureRef}>
            <Animated.View
              style={[styles.pagerRow, { width: pageWidth * TAB_ORDER.length }, pagerStyle]}
            >
              {TAB_ORDER.map((key, index) => (
                <View
                  key={key}
                  // Off-screen is not free on Android. The renderer prepares
                  // every bitmap in every drawn child before each frame, and a
                  // page that sits a screen-width to the side is still drawn
                  // into the row. Six mounted feeds put ~340 image textures in
                  // the GPU cache — 112MB of a 121MB budget on a fresh launch,
                  // measured on a Galaxy S24+ — and once a session tipped over
                  // the budget every frame evicted and re-uploaded, which was
                  // the "slow bitmap upload" jank on every tab and the taps
                  // that would not land. `display: none` maps to INVISIBLE on
                  // Android: skipped at draw, so its textures become
                  // purgeable, while React state and the query cache stay put.
                  // PagerPage reveals neighbours only as a drag reaches them.
                  // The slot itself always keeps its width. Hiding the slot
                  // took it out of the row's layout, every page after it slid
                  // one slot left, and the pager's translate — index times
                  // pageWidth — then landed on the wrong list: the Images tab
                  // showed the video feed and the Video tab an empty slot. The
                  // hide lives on the inner wrapper instead.
                  style={{ width: pageWidth }}
                  pointerEvents={index === activeIndex ? "auto" : "none"}
                >
                  <PagerPage index={index} progress={progress}>
                    <HomePullRefreshContext.Provider value={index === activeIndex ? homePull.provider : null}>
                      {renderPage(key, index)}
                    </HomePullRefreshContext.Provider>
                  </PagerPage>
                </View>
              ))}
            </Animated.View>
          </PagerGestureProvider>

          {/* Covers the pager, never the header: the filter panel and nav bar
              stay live so the user can keep adjusting while this is up. */}
          {filterLoaderActive && <FeedFilterLoader topInset={feedInset} />}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      </FrostedContent>

      <Animated.View
        style={[styles.headerClip, glassNav ? styles.headerClear : null, island ? { overflow: "visible" } : null, headerAnimatedStyle]}
        // The island's header is mostly empty space around the capsule; taps
        // there belong to the feed underneath.
        pointerEvents={island ? "box-none" : "auto"}
        onLayout={onHeaderLayout}
      >
        {theme === "system" && pillTopInHeader > 0 ? (
          <View
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: pillTopInHeader, backgroundColor: colors.background }}
          />
        ) : null}
        {island ? (
          <IslandCapsule
            activeIndex={activeIndex}
            menuOpen={islandMenuOpen}
            onToggleMenu={toggleIslandMenu}
            onAvatarPress={openDrawer}
            pullMotion={homePull.motion}
          />
        ) : (
          <HomeHeader
            pullDistance={pullDistance}
            onLogoPress={handleLogoPress}
            onMenuPress={openDrawer}
          />
        )}

        {island && islandMenuOpen ? (
          <IslandFeedMenu
            activeIndex={activeIndex}
            onSelect={handleIslandSelect}
            onFilters={handleIslandFilters}
            onClose={closeIslandMenu}
            onMenu={() => { closeIslandMenu(); openDrawer(); }}
          />
        ) : null}

        {showNavPill ? (
        <View onLayout={onNavLayout}>
        {/* The pill only blurs feed you can see around it. Under the opaque
            header (no glassNav) the feed still scrolls on beneath it, and so
            does a feed covered by a post or profile opened in place; blurring
            those smeared hidden images through the pill. */}
        <FrostedBackground when={!glassNav || !!feedPost || feedProfileVisible}>
        <FeedNavBar
          activeIndex={activeIndex}
          progress={progress}
          isFilterOpen={filterPanelVisible}
          hasActiveFilters={hasActiveFilters}
          onPostTypeChange={handleNavPostTypeChange}
          onFilterPress={handleFilterPress}
          onActiveTabLongPress={handleIslandFilters}
          backMode={feedProfileVisible || !!imageFeed || !!feedPost}
          onBackPress={feedProfileVisible ? hideUserProfile : imageFeed ? handleImageFeedBack : closeFeedPost}
        />
        </FrostedBackground>
        </View>
        ) : null}


        {theme !== 'system' ? filterPanel : null}
      </Animated.View>

      {/* Frost under the status bar, so nothing slides sharp under the clock. */}
      <StatusBarFrost />

      {!island && showNavPill && !filterPanelVisible ? (
        <FeedPillGlow
          distance={pullDistance}
          pillBottom={navPillBottom}
          headerY={headerTranslateY}
          width={pageWidth}
          inset={theme === 'minimal' ? 0 : NAV_PILL_SIDE_INSET}
        />
      ) : null}

      {/* Over the header, not inside the feed. The drawer's window starts at
          the pill's bottom edge, so it pulls out from under the pill and
          slides back behind it, and never covers the pill's own border. */}
      {island || pillBottom > 0 ? (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.beadHost, { top: beadTop, height: CHIP_GAP + CHIP_HEIGHT + 28, paddingTop: CHIP_GAP }, headerAnimatedStyle]}
        >
          {showBead && newPostsBead ? (
            <Animated.View entering={beadEnter} exiting={beadExit}>
              <Animated.View style={chipTuckStyle}>
              <NewPostsBead
                count={newPostsBead.count}
                authors={newPostsBead.authors}
                islandChrome={island}
                onPress={newPostsBead.onPress}
                label={newPostsBead.label}
              />
            </Animated.View>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* A sibling keeps the drawer below the pill and its complete touch
          area inside its parent without changing the measured feed inset. */}
      {theme === 'system' ? (
        <Animated.View
          pointerEvents={filterPanelVisible ? 'box-none' : 'none'}
          style={[styles.systemFilterOverlay, {
            top: Math.max(0, pillTopInHeader - NAV_PILL_TOP_INSET - 1),
            height: FEED_FILTER_MAX_HEIGHT + navOverlap + NAV_PILL_TOP_INSET,
          }, headerAnimatedStyle]}
        >
          {filterPanel}
        </Animated.View>
      ) : null}


      {/* Under the header like the profile below, so the logo bar and pill do
          not move or redraw. A profile opened from the post sits on top of it
          and Back returns to the post. */}
      {feedPost ? (
        // Rises in over the feed the way a pushed page does (Android's
        // fade_from_bottom), and sinks back out on Back.
        <Animated.View
          entering={FadeInUp.duration(220).easing(Easing.out(Easing.cubic))}
          exiting={FadeOutDown.duration(160)}
          style={[styles.profileSurface, { top: postSurfaceTop, paddingTop: headerHeight - postSurfaceTop }, skin ? { backgroundColor: skin.page } : null]}
          accessibilityViewIsModal
          testID="home-feed-post"
        >
          <FeedPostSurface key={feedPost} tokenId={feedPost} onClose={closeFeedPost} bottomInset={TAB_BAR_CONTENT_INSET} />
        </Animated.View>
      ) : null}

      {feedProfileVisible ? (
        <View
          style={[styles.profileSurface, { top: headerHeight }]}
          accessibilityViewIsModal
        >
          <UserProfileBottomSheet
            embedded
            visible
            usernameOrAddress={profileIdentifier}
            onClose={hideUserProfile}
          />
        </View>
      ) : null}

      {/* Outside the pager's GestureDetector: the sheet has its own page turn,
          which slides the sheet with the Images page so the tab change is
          seen, and which a post's photo gallery blocks while it scrolls. */}
      {imageFeed ? (
        <GestureDetector gesture={drawerPagerGesture}>
        <Animated.View pointerEvents="box-none" style={[styles.drawerLayer, drawerSlideStyle]}>
        <PagerGestureProvider gestureRef={drawerPagerRef}>
        <ImageFeedDrawer
          key={imageFeed.token}
          ref={imageDrawerRef}
          showCloseButton={false}
          initialItems={imageFeed.items}
          initialIndex={imageFeed.index}
          feedParams={feedParams}
          pageSize={20}
          topInset={headerHeight}
          headerTranslateY={headerTranslateY}
          bottomInset={TAB_BAR_CONTENT_INSET}
          scrollHandler={scrollHandler}
          onScrollBegin={handleScrollBegin}
          onScrollEnd={handleScrollEnd}
          onClose={handleCloseImageFeed}
        />
        </PagerGestureProvider>
        </Animated.View>
        </GestureDetector>
      ) : null}

      {/* Draws nothing at all unless this account is mid-walkthrough or has
          just been offered one. Outside the pager so it is the same card on
          every tab rather than a header in one of six lists. */}
      <GettingStartedCard />
    </View>
  );
}

const styles = StyleSheet.create({
  // The row is six screens wide and slides under a clipped viewport, so the
  // five inactive pages are outside the visible bounds and cost no compositing.
  pagerViewport: { flex: 1, overflow: "hidden" },
  // ImageFeedDrawer's own layer (absolute fill, above the pager), carried here
  // so the sheet can slide sideways with a page turn.
  drawerLayer: { ...StyleSheet.absoluteFillObject, zIndex: 9 },
  feedUnclip: { flex: 1 },
  pagerRow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
  },
  beadHost: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    overflow: "hidden",
    zIndex: 11,
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
  // Canvas themes draw no band behind the logo row and feed tabs: both float
  // straight over the backdrop, as on web.
  headerClear: {
    backgroundColor: "transparent",
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
  },
  systemFilterOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9,
  },
  profileSurface: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9,
    backgroundColor: "#010305",
  },
});
