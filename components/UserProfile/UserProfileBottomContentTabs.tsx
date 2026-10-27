import { PROFILE_BAR_HEIGHT, PROFILE_TABS_TOP_GAP, PINNED_PROFILE_TABS_HEIGHT } from '../Profile/useProfileCollapse';
import type { SharedValue } from 'react-native-reanimated';
import { translateCopy as _translateCopy } from '../../i18n/copy';
import React, {
  Activity,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  View,
  FlatList,
  Pressable,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Icon from "../ui/Icon";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { theme } from "../../theme";
import ProfileImageGrid from "../Profile/ProfileImageGrid";
import PlanCard from "../Subscription/PlanCard";
import VideosRoute from "../Profile/VideosRoute";
import LivestreamsRoute from "../Profile/LivestreamsRoute";
import FractionsRoute from "../Profile/FractionsRoute";
import PinnedRoute from "../Profile/PinnedRoute";
import DislikesRoute from "../Profile/DislikesRoute";
import PlaylistsRoute from "../Profile/PlaylistsRoute";
import ProfileFeedTypeRoute from "../Profile/ProfileFeedTypeRoute";
import PostsRoute from "../Profile/PostsRoute";
import FeedRoute from "../Profile/FeedRoute";
import ProfileTabBar, { type ProfileTabItem } from "../Profile/ProfileTabBar";
import ProfileScrollViewport from "../Profile/ProfileScrollViewport";
import ProfilePinnedBar, { type ProfilePinnedIdentity } from "../Profile/ProfilePinnedBar";
import ProfileEmptyState from "../Profile/ProfileEmptyState";
import ProfileContentToolbar from "../Profile/ProfileContentToolbar";
import ProfileFilterDrawer from "../Profile/ProfileFilterDrawer";
import {
  CONTENT_BACKED_TABS,
  useProfileContentFilters,
} from "../Profile/useProfileContentFilters";
import { useProfileContentCounts } from "../Profile/useProfileContentCounts";
import { getPlans, type SubscriptionPlan } from "../../services/subscription.service";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../context/ThemeContext";
import { useTabBarScrollHide } from "../../hooks/useTabBarScrollHide";
import { DEFAULT_PROFILE_TAB, type ProfileDefaultTab } from "../../libs/profile-default-tab";

interface UserProfileBottomContentTabsProps {
  pinnedIdentity?: ProfilePinnedIdentity;
  profileScrollY?: SharedValue<number>;
  profileActionsBottom?: SharedValue<number>;
  profileTabsPinned?: SharedValue<boolean>;
  address: string;
  onClose: () => void;
  scrollEnabled: boolean;
  isFullScreen: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  registerScrollToTop: (handler: (() => void) | null) => void;
  isPrivate?: boolean;
  canViewContent?: boolean;
  isFollowRequestPending?: boolean;
  onFollow?: () => void;
  isOwnProfile?: boolean;
  onEditProfile?: () => void;
  /** In fullscreen, the profile header is rendered inside the FlatList for unified scroll. */
  profileHeader?: React.ReactNode;
  /** Block state flags */
  isBlocked?: boolean;
  youBlocked?: boolean;
  blockedYou?: boolean;
  /** One-shot tab request from the header (the Subscribe CTA). */
  pendingTab?: string | null;
  onPendingTabConsumed?: () => void;
  /** The tab the owner chose for visitors to land on (`customs.defaultProfileTab`). */
  defaultTab?: ProfileDefaultTab;
  /** Someone else's profile whose owner made their Dislikes tab public. */
  showDislikesTab?: boolean;
  /** Back-to-top button's distance from the bottom; the host knows what sits there. */
  backToTopBottom?: number;
}

/** Horizontal padding for post cards. Kept tight so content isn't crowded by
 *  large left/right gaps inside the profile sheet. */
const CONTENT_PX = 12;

/** Stable contentContainerStyle (same identity across renders to avoid FlatList churn). */
const LIST_CONTENT_STYLE = { paddingBottom: 80 } as const;
const LIST_CONTENT_STYLE_COLLAPSED = { paddingBottom: 24 } as const;

/** Visited tabs kept mounted (hidden) per profile, the active one included. */
const MAX_KEPT_TABS = 4;

type ContentTab =
  | "home"
  | "posts"
  | "images"
  | "videos"
  | "songs"
  | "live"
  | "fractions"
  | "subscribers"
  | "pinned"
  | "playlists"
  | "dislikes";

const BASE_TAB_ITEMS: ProfileTabItem<ContentTab>[] = [
  { key: "home", get label() { return _translateCopy("copy.a52ace420f21", { defaultValue: "All" }); }, icon: "House" },
  { key: "posts", get label() { return _translateCopy("copy.a80811cf6889", { defaultValue: "Posts" }); }, icon: "MessageSquare" },
  { key: "images", get label() { return _translateCopy("copy.be7e2f201293", { defaultValue: "Images" }); }, icon: "Image" },
  { key: "videos", get label() { return _translateCopy("copy.c9a9639463c2", { defaultValue: "Videos" }); }, icon: "Film" },
  { key: "subscribers", get label() { return _translateCopy("copy.17371507e9f7", { defaultValue: "Subs" }); }, icon: "Star" },
  { key: "songs", get label() { return _translateCopy("copy.bc1b88907d3b", { defaultValue: "Audio" }); }, icon: "Play" },
  { key: "live", get label() { return _translateCopy("copy.b64ac05f17e6", { defaultValue: "Live" }); }, icon: "Radio" },
  { key: "fractions", get label() { return _translateCopy("copy.487aaa977933", { defaultValue: "Fractions" }); }, icon: "ChartPie" },
  { key: "pinned", get label() { return _translateCopy("copy.f20c87946555", { defaultValue: "Pinned" }); }, icon: "Pin" },
  { key: "playlists", get label() { return _translateCopy("copy.dcd0a4d2c65a", { defaultValue: "Playlists" }); }, icon: "ListVideo" },
];

const UserProfileBottomContentTabs: React.FC<
  UserProfileBottomContentTabsProps
> = ({
  pinnedIdentity,
  profileScrollY,
  profileActionsBottom,
  profileTabsPinned,
  address,
  onClose,
  scrollEnabled,
  isFullScreen,
  onScroll,
  registerScrollToTop,
  isPrivate = false,
  canViewContent = true,
  isFollowRequestPending = false,
  onFollow,
  isOwnProfile = false,
  onEditProfile,
  profileHeader,
  isBlocked = false,
  youBlocked = false,
  blockedYou = false,
  pendingTab = null,
  onPendingTabConsumed,
  defaultTab = DEFAULT_PROFILE_TAB,
  backToTopBottom,
  showDislikesTab = false,
}) => {
  const { t } = useTranslation();
  const { isMinimal } = useAppTheme();
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  // One list ref per kept tab: a hidden tab detaches its refs, so a shared
  // ref could end up empty or pointing at a list that is not on screen.
  const listRefs = useRef(new Map<ContentTab, React.RefObject<FlatList<any> | null>>());
  const listRefFor = useCallback((tab: ContentTab) => {
    let ref = listRefs.current.get(tab);
    if (!ref) {
      ref = React.createRef<FlatList<any>>();
      listRefs.current.set(tab, ref);
    }
    return ref;
  }, []);
  const counts = useProfileContentCounts(address);

  // Active content tab
  const [activeTab, setActiveTab] = useState<ContentTab>(defaultTab);

  // Tabs already opened on this profile stay mounted but hidden, so going
  // back to one is instant and lands where it was left, instead of rebuilding
  // the list and the whole profile header behind it. Capped, most recent last.
  const [keptTabs, setKeptTabs] = useState<{ address: string; tabs: ContentTab[] }>({ address, tabs: [] });
  useEffect(() => {
    setKeptTabs((kept) => {
      const tabs = kept.address === address ? kept.tabs : [];
      if (tabs[tabs.length - 1] === activeTab && kept.address === address) return kept;
      return { address, tabs: [...tabs.filter((tab) => tab !== activeTab), activeTab].slice(-MAX_KEPT_TABS) };
    });
  }, [activeTab, address]);
  const paneTabs = keptTabs.address === address
    ? keptTabs.tabs.includes(activeTab) ? keptTabs.tabs : [...keptTabs.tabs, activeTab]
    : [activeTab];

  // Open each profile on the tab its owner picked. Applied once per address:
  // one sheet instance is reused for every profile, and a visitor's own tab
  // taps afterwards must not be undone when the account record refreshes.
  const appliedDefaultFor = useRef<string | null>(null);
  useEffect(() => {
    if (!address || appliedDefaultFor.current === address) return;
    appliedDefaultFor.current = address;
    setActiveTab(defaultTab);
  }, [address, defaultTab]);

  // The header's Subscribe CTA lives one level up, so it asks for a tab rather
  // than owning one. Cleared immediately so a second press still works.
  useEffect(() => {
    if (!pendingTab) return;
    setActiveTab(pendingTab as ContentTab);
    onPendingTabConsumed?.();
  }, [pendingTab, onPendingTabConsumed]);

  // Sort, search and filter over this creator's channel — the same hook the
  // signed-in user's own profile uses, so the two surfaces stay identical.
  // Keyed on address: one sheet instance is reused for every profile opened,
  // so without that the last person's filters would carry over to the next.
  const { toolbar, panel, contentQuery, homePostType } =
    useProfileContentFilters(activeTab, address);

  const tabItems = useMemo<ProfileTabItem<ContentTab>[]>(() => {
    const withCounts = BASE_TAB_ITEMS.map((item) => ({
      ...item,
      label: item.key === "playlists" ? t("profile.tabPlaylists") : item.label,
      count: (counts as Record<string, number | undefined>)[item.key] ?? 0,
    }))
      // Public playlists only earn a tab once there is one to show.
      .filter((item) => item.key !== "playlists" || (item.count ?? 0) > 0);
    const home = withCounts.find((item) => item.key === "home")!;
    const rest = withCounts
      .filter((item) => item.key !== "home")
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    // Dislikes: always on your own profile, on anyone else's only if they made it public. Last, unsorted.
    const dislikes: ProfileTabItem<ContentTab>[] = isOwnProfile || showDislikesTab
      ? [{ key: "dislikes", label: t("profile.tabDislikes"), icon: "ThumbsDown", count: 0 }]
      : [];
    return [home, ...rest, ...dislikes];
  }, [counts, t, isOwnProfile, showDislikesTab]);

  // Track scroll offset for sticky bar + back-to-top
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [stickyVisible, setStickyVisible] = useState(false);

  // Mirrors of the state above, read and written from the UI thread inside the
  // worklet below. React state can't be read there, and a plain ref written
  // from the UI thread wouldn't be visible to JS reliably.
  const headerHeightShared = useSharedValue(0);
  const stickyVisibleShared = useSharedValue(false);
  const stickyStyle = useAnimatedStyle(() => ({ opacity: stickyVisibleShared.value ? 1 : 0 }));
  // Preserve header geometry while removing its offscreen masks from drawing.
  const expandedHeaderStyle = useAnimatedStyle(() => ({ opacity: stickyVisibleShared.value ? 0 : 1 }));
  const showBackToTopShared = useSharedValue(false);
  const isFullScreenShared = useSharedValue(isFullScreen);
  // Where each kept tab was left, written by the scroll worklet. A tab opened
  // for the first time starts at the top; one kept from earlier comes back at
  // its own offset, and the pinned bar follows whichever is on screen.
  const activeTabShared = useSharedValue<string>(activeTab);
  const tabOffsets = useSharedValue<Record<string, number>>({});
  useEffect(() => {
    tabOffsets.value = {};
  }, [address, tabOffsets]);
  useEffect(() => {
    activeTabShared.value = activeTab;
    runOnUI((tab: string) => {
      'worklet';
      const y = tabOffsets.value[tab] ?? 0;
      if (profileScrollY) profileScrollY.value = y;
      const threshold = headerHeightShared.value;
      const stuck = threshold > 0 && y >= threshold + PROFILE_TABS_TOP_GAP - 4;
      if (profileTabsPinned) profileTabsPinned.value = stuck;
      stickyVisibleShared.value = stuck;
      runOnJS(setStickyVisible)(stuck);
      const backToTop = y > 600;
      showBackToTopShared.value = backToTop;
      runOnJS(setShowBackToTop)(backToTop);
    })(activeTab);
  }, [activeTab, address, activeTabShared, tabOffsets, profileScrollY, profileTabsPinned, headerHeightShared, stickyVisibleShared, showBackToTopShared]);
  useEffect(() => {
    isFullScreenShared.value = isFullScreen;
  }, [isFullScreen, isFullScreenShared]);

  // Images tab state
  const [images, setImages] = useState<UnifiedFeedItem[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  /** Guards against a slow early request landing after a faster later one. */
  const imagesRequestRef = useRef(0);
  // ProfileImageGrid requires a defined id per item (used as the React key);
  // UnifiedFeedItem's id is optional, so fall back to tokenId — always present
  // for real posts — rather than widening ProfileImageGrid's contract.
  const gridImages = useMemo(
    () => images.map((img) => ({ ...img, id: img.id ?? img.tokenId ?? "" })),
    [images],
  );

  // Subscribers tab state
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansLoaded, setPlansLoaded] = useState(false);

  // Fetch images when the tab is visited, and again whenever the toolbar
  // narrows the query. This used to run once behind an `imagesLoaded` flag,
  // which would have made every filter a no-op here — the tab would keep
  // showing the unfiltered page it happened to load first.
  // The tab stays mounted once opened, so coming back to the same profile and
  // query keeps the grid it has instead of refetching behind a spinner.
  const imagesQueryRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTab !== "images") return;
    const query = `${address}|${JSON.stringify(contentQuery)}`;
    if (imagesQueryRef.current === query) return;
    imagesQueryRef.current = query;
    const seq = ++imagesRequestRef.current;
    setImagesLoading(true);
    (async () => {
      try {
        const res = await getUnifiedFeed({
          minter: address,
          postType: "feed-images",
          ...contentQuery,
          status: "all",
          page: 1,
          limit: 30,
        });
        if (seq !== imagesRequestRef.current) return;
        setImages(res.result || []);
      } catch {
        if (seq === imagesRequestRef.current) {
          setImages([]);
          // Let the next visit try again.
          imagesQueryRef.current = null;
        }
      } finally {
        if (seq === imagesRequestRef.current) setImagesLoading(false);
      }
    })();
  }, [activeTab, address, contentQuery]);

  // Fetch plans when subscribers tab is first visited
  useEffect(() => {
    if (!plansLoaded && activeTab === "subscribers") {
      setPlansLoading(true);
      (async () => {
        try {
          const result = await getPlans(address);
          setPlans(result);
        } catch {}
        finally {
          setPlansLoading(false);
          setPlansLoaded(true);
        }
      })();
    }
  }, [activeTab, plansLoaded, address]);

  // Reset sticky state when switching between fullscreen and collapsed
  useEffect(() => {
    if (!isFullScreen) {
      stickyVisibleShared.value = false;
      showBackToTopShared.value = false;
      setStickyVisible(false);
      setShowBackToTop(false);
    }
  }, [isFullScreen, stickyVisibleShared, showBackToTopShared]);

  // When collapsed, constrain height; fullscreen fills available space
  const listHeight = useMemo(() => {
    if (isFullScreen) return undefined;
    const winH = Dimensions.get("window").height;
    return Math.min(560, Math.max(360, Math.round(winH * 0.55)));
  }, [isFullScreen]);

  // Custom fetcher that uses the /feed endpoint
  const scrollToTop = useCallback(() => {
    listRefFor(activeTab).current?.scrollToOffset({ offset: 0, animated: true });
  }, [activeTab, listRefFor]);

  useEffect(() => {
    registerScrollToTop(scrollToTop);
    return () => {
      registerScrollToTop(null);
    };
  }, [registerScrollToTop, scrollToTop]);

  // Open the full-screen image feed for the tapped image. Dismiss the sheet
  // first, otherwise the viewer renders behind it.
  const handleImagePress = useCallback(
    (index: number) => {
      hideUserProfile();
      onClose();
      navigation.navigate(ScreenNames.ImageFeed as never, {
        initialIndex: index,
        initialItems: images,
        // Carries the toolbar's query so the viewer's own paging matches the
        // grid it was opened from, rather than paging the unfiltered channel.
        feedParams: {
          minter: address,
          postType: "feed-images",
          ...contentQuery,
        },
      } as never);
    },
    [images, address, contentQuery, navigation, hideUserProfile, onClose],
  );

  // Measure profile header height to know when to show sticky bar
  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    // A kept tab's copy of the header measures 0 while that tab is hidden.
    const height = e.nativeEvent.layout.height;
    if (height > 0) headerHeightShared.value = height;
  }, [headerHeightShared]);

  // Sticky bar + back-to-top, entirely on the UI thread. This used to be a
  // plain JS onScroll: every one of the profile's lists (Posts, Home, the
  // subscribers list, the image grid) crossed the bridge on every scroll
  // event, at any scroll speed, to run two threshold comparisons that only
  // ever changed state a few times per scroll. `onScroll` (the prop from
  // UserProfileBottomSheet) has always been a no-op stub — there is nothing
  // real to forward here, so this drops the per-frame JS hop entirely rather
  // than paying it to call a function that does nothing.
  const { drive: driveTabBar } = useTabBarScrollHide();
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!isFullScreenShared.value) return;

      const y = event.contentOffset.y;
      if (profileScrollY) profileScrollY.value = y;
      const tab = activeTabShared.value;
      if (tabOffsets.value[tab] !== y) {
        tabOffsets.modify((offsets) => {
          'worklet';
          offsets[tab] = y;
          return offsets;
        });
      }
      // Bottom nav hides on scroll down and returns on scroll up, as on home.
      driveTabBar(y);

      const threshold = headerHeightShared.value;
      if (threshold > 0) {
        const shouldStick = y >= threshold + PROFILE_TABS_TOP_GAP - 4;
        if (profileTabsPinned) profileTabsPinned.value = shouldStick;
        if (shouldStick !== stickyVisibleShared.value) {
          stickyVisibleShared.value = shouldStick;
          runOnJS(setStickyVisible)(shouldStick);
        }
      }

      const shouldShowBackToTop = y > 600;
      if (shouldShowBackToTop !== showBackToTopShared.value) {
        showBackToTopShared.value = shouldShowBackToTop;
        runOnJS(setShowBackToTop)(shouldShowBackToTop);
      }
    },
  });

  // Underline indicator for tabs
  // Tab change: the pane and the pinned bar are brought in line with that
  // tab's own offset by the effect on activeTab above.
  const handleTabChange = useCallback(
    (tab: ContentTab) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
    },
    [activeTab],
  );

  // Clean underline tab bar — horizontally scrollable so all content tabs fit.
  const TabBar = useMemo(
    () => (
      <ProfileTabBar
        items={tabItems}
        activeKey={activeTab}
        onChange={handleTabChange}
      />
    ),
    [activeTab, handleTabChange, tabItems],
  );

  // Empty state for Reposts tab
  // Private/blocked account message component
  const PrivateAccountMessage = useMemo(() => {
    if (canViewContent) return null;

    // Blocked state takes precedence over private
    // Minimal: the icon sits bare on black — no tinted tile around it.
    const iconBox = isMinimal ? "p-5 mb-5" : "bg-theme-neutrals-800/50 rounded-2xl p-5 mb-5";

    if (isBlocked) {
      return (
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className={iconBox}>
            <Icon name="Ban" size={40} color={theme.colors.neutrals[500]} />
          </View>
          {!youBlocked && (
            <Text className="text-white text-lg font-bold text-center mb-2">
              {t("follow.contentUnavailable")}
            </Text>
          )}
          <Text className="text-gray-400 text-center text-sm leading-5 mb-5">
            {youBlocked
              ? t("follow.youBlockedBody")
              : t("follow.restrictedBody")}
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <View className={iconBox}>
          <Icon name="Lock" size={40} color={theme.colors.neutrals[500]} />
        </View>
        <Text className="text-white text-lg font-bold text-center mb-2">
          {t("follow.privateTitle")}
        </Text>
        <Text className="text-gray-400 text-center text-sm leading-5 mb-5">
          {isFollowRequestPending
            ? t("follow.requestPendingBody")
            : t("follow.followToSeePosts")}
        </Text>
        {!isFollowRequestPending && onFollow && (
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={onFollow}
              className="bg-transparent px-8 py-3 rounded-xl"
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold text-sm">{t("follow.follow")}</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
        )}
      </View>
    );
  }, [
    canViewContent,
    isFollowRequestPending,
    onFollow,
    isBlocked,
    youBlocked,
    blockedYou,
    isMinimal,
  ]);

  /**
   * Sort / search / filter, on the tabs actually served by this creator's feed
   * query. Fullscreen only: collapsed, the sheet is a fixed 360–560pt preview,
   * and a 420pt filter panel inside it would be taller than the sheet. The
   * state survives the collapse, so expanding again brings it back.
   */
  const ContentToolbar = useMemo(() => {
    if (!isFullScreen || !CONTENT_BACKED_TABS.includes(activeTab)) return null;
    return (
      <>
        <ProfileContentToolbar {...toolbar} />
        <ProfileFilterDrawer {...panel} onClose={toolbar.onFiltersClose} />
      </>
    );
  }, [isFullScreen, activeTab, toolbar, panel]);

  // Simple white activity indicator for loading state (preserves header visibility)
  // Fullscreen list header: profile header + optional Edit Profile + tab bar inside FlatList
  const fullScreenListHeader = useMemo(() => {
    if (!profileHeader) return undefined;
    return (
      <View>
        <Animated.View style={expandedHeaderStyle} onLayout={handleHeaderLayout}>{profileHeader}</Animated.View>
        {TabBar}
        {ContentToolbar}
      </View>
    );
  }, [profileHeader, handleHeaderLayout, TabBar, ContentToolbar, expandedHeaderStyle]);

  if (!address) return null;

  // Keep the pinned tabs outside the native clipping layer so their elevation
  // can place them above the joined Back plate, as on the own-profile screen.
  const renderScrollViewport = (content: React.ReactNode) =>
    isFullScreen && profileScrollY && profileActionsBottom ? (
      <ProfileScrollViewport scrollY={profileScrollY} actionsBottom={profileActionsBottom} tabsPinned={profileTabsPinned}>
        {content}
      </ProfileScrollViewport>
    ) : content;

  // Private account: show header + message, no feed
  if (!canViewContent) {
    return (
      <View style={isFullScreen ? { flex: 1 } : { height: listHeight }}>
        {renderScrollViewport(
          <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
            {isFullScreen && profileHeader}
            {PrivateAccountMessage}
          </Animated.ScrollView>,
        )}
      </View>
    );
  }

  /*
   * Single InfiniteFeed instance for Posts — always mounted so data survives
   * collapsed ↔ fullscreen transitions (no skeleton flash).
   *
   * Fullscreen: profileHeader + TabBar flow inside the FlatList header
   *             so the whole page scrolls as one (Twitter-like).
   * Collapsed:  no list header; posts shown in a compact fixed-height area.
   *
   * Replies & Reposts tabs show placeholder empty states.
   */
  // Content for one tab. Only tabs already opened are mounted (see keptTabs),
  // and every one but the active tab sits in a hidden Activity: off layout,
  // effects (players, viewability, view tracking) stopped, state kept.
  const renderTabContent = (tab: ContentTab) => {
    const mt = isFullScreen ? 0 : 4;
    switch (tab) {
      case "home":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <FeedRoute
              listRef={listRefFor(tab)}
              address={address}
              onScroll={scrollHandler}
              scrollEnabled={scrollEnabled}
              listHeader={isFullScreen ? fullScreenListHeader : undefined}
              onBeforeNavigate={onClose}
              postType={homePostType}
              {...contentQuery}
            />
          </View>
        );
      case "posts":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <PostsRoute
              listRef={listRefFor(tab)}
              address={address}
              onScroll={scrollHandler}
              scrollEnabled={scrollEnabled}
              listHeader={isFullScreen ? fullScreenListHeader : undefined}
              onBeforeNavigate={onClose}
            />
          </View>
        );
      case "images":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            {imagesLoading ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
                {isFullScreen && fullScreenListHeader}
                <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color="#fff" /></View>
              </Animated.ScrollView>
            ) : images.length === 0 ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
                {isFullScreen && fullScreenListHeader}
              <ProfileEmptyState
                kind="images"
                title={t("profile.noImages")}
                subtitle={t("profile.noImagesSub")}
              />
              </Animated.ScrollView>
            ) : (
              // onScroll was previously omitted here, so this tab alone never
              // drove the sticky bar / back-to-top button.
              <ProfileImageGrid
              listRef={listRefFor(tab)}
              images={gridImages}
                scrollEnabled={scrollEnabled}
                onImagePress={handleImagePress}
                onScroll={scrollHandler}
                ListHeaderComponent={isFullScreen ? fullScreenListHeader : undefined}
              />
            )}
          </View>
        );
      case "subscribers":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            {plansLoading ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
                {isFullScreen && fullScreenListHeader}
                <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color="#fff" /></View>
              </Animated.ScrollView>
            ) : plans.length === 0 ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled} showsVerticalScrollIndicator={false}>
                {isFullScreen && fullScreenListHeader}
              <ProfileEmptyState
                kind="subscribers"
                title={t("profile.noPlans")}
                subtitle={t("profile.noPlansSub")}
              />
              </Animated.ScrollView>
            ) : (
              <Animated.FlatList
                ref={listRefFor(tab)}
                ListHeaderComponent={isFullScreen ? fullScreenListHeader : undefined}
                data={plans}
                keyExtractor={(item: SubscriptionPlan) => String(item._id || item.id || Math.random())}
                renderItem={({ item }: { item: SubscriptionPlan }) => <View style={{ paddingHorizontal: CONTENT_PX, marginBottom: 8 }}><PlanCard plan={item} /></View>}
                scrollEnabled={scrollEnabled}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={isFullScreen ? LIST_CONTENT_STYLE : LIST_CONTENT_STYLE_COLLAPSED}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        );
      case "videos":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <VideosRoute listRef={listRefFor(tab)} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} {...contentQuery} />
          </View>
        );
      case "songs":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <ProfileFeedTypeRoute
              listRef={listRefFor(tab)}
              onScroll={scrollHandler}
              listHeader={isFullScreen ? fullScreenListHeader : undefined}
              address={address}
              postType="feed-audio"
              onBeforeNavigate={onClose}
            />
          </View>
        );
      case "live":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <LivestreamsRoute listRef={listRefFor(tab)} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "fractions":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <FractionsRoute listRef={listRefFor(tab)} address={address} isOwnProfile={isOwnProfile} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "pinned":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <PinnedRoute listRef={listRefFor(tab)} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "dislikes":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <DislikesRoute listRef={listRefFor(tab)} address={address} isOwnProfile={isOwnProfile} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "playlists":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <PlaylistsRoute listRef={listRefFor(tab)} address={address} isOwnProfile={isOwnProfile} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <View
      style={isFullScreen ? { flex: 1 } : { height: listHeight, marginTop: 16 }}
    >
      {!isFullScreen && TabBar}
      {renderScrollViewport(paneTabs.map((tab) => (
        <Activity key={`${address}:${tab}`} mode={tab === activeTab ? "visible" : "hidden"}>
          {renderTabContent(tab)}
        </Activity>
      )))}

      {isFullScreen && (
        <Animated.View
          pointerEvents={stickyVisible ? 'auto' : 'none'}
          accessibilityElementsHidden={!stickyVisible}
          importantForAccessibility={stickyVisible ? 'auto' : 'no-hide-descendants'}
          style={[{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: PROFILE_BAR_HEIGHT,
            zIndex: 40,
            elevation: 40,
          }, stickyStyle]}
        >
          <ProfilePinnedBar {...pinnedIdentity} onBackPress={onClose}>
            <ProfileTabBar items={tabItems} activeKey={activeTab} onChange={handleTabChange} pinned embedded />
          </ProfilePinnedBar>
        </Animated.View>
      )}

      {isFullScreen && showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel={t("profile.backToTop")}
          className="absolute right-5 bg-theme-neutrals-800/90 rounded-xl p-3 active:opacity-80"
          style={{
            bottom: backToTopBottom ?? 24,
            zIndex: 20,
            elevation: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            // Minimal carries no shadows. Elevation stays: on Android it is
            // what keeps this button stacked above the list.
            ...(isMinimal ? { shadowOpacity: 0 } : null),
          }}
        >
          <Icon
            name="ChevronUp"
            size={22}
            color={theme.colors.accent}
          />
        </Pressable>
      )}
    </View>
  );
};

export default UserProfileBottomContentTabs;
