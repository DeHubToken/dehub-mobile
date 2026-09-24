import React, {
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
  useAnimatedScrollHandler,
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
import PlaylistsRoute from "../Profile/PlaylistsRoute";
import ProfileFeedTypeRoute from "../Profile/ProfileFeedTypeRoute";
import PostsRoute from "../Profile/PostsRoute";
import FeedRoute from "../Profile/FeedRoute";
import ProfileTabBar, { type ProfileTabItem } from "../Profile/ProfileTabBar";
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

interface UserProfileBottomContentTabsProps {
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
}

const STICKY_BAR_HEIGHT = 68;

/** Horizontal padding for post cards. Kept tight so content isn't crowded by
 *  large left/right gaps inside the profile sheet. */
const CONTENT_PX = 12;

/** Stable contentContainerStyle (same identity across renders to avoid FlatList churn). */
const LIST_CONTENT_STYLE = { paddingBottom: 80 } as const;
const LIST_CONTENT_STYLE_COLLAPSED = { paddingBottom: 24 } as const;

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
  | "playlists";

const BASE_TAB_ITEMS: ProfileTabItem<ContentTab>[] = [
  { key: "home", label: "All", icon: "House" },
  { key: "posts", label: "Posts", icon: "MessageSquare" },
  { key: "images", label: "Images", icon: "Image" },
  { key: "videos", label: "Videos", icon: "Film" },
  { key: "subscribers", label: "Subs", icon: "Star" },
  { key: "songs", label: "Audio", icon: "Play" },
  { key: "live", label: "Live", icon: "Radio" },
  { key: "fractions", label: "Fractions", icon: "ChartPie" },
  { key: "pinned", label: "Pinned", icon: "Pin" },
  { key: "playlists", label: "Playlists", icon: "ListVideo" },
];

const UserProfileBottomContentTabs: React.FC<
  UserProfileBottomContentTabsProps
> = ({
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
}) => {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const listRef = useRef<FlatList<any> | null>(null);
  const counts = useProfileContentCounts(address);

  // Active content tab
  const [activeTab, setActiveTab] = useState<ContentTab>("home");

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
    return [home, ...rest];
  }, [counts, t]);

  // Track scroll offset for sticky bar + back-to-top
  const [showBackToTop, setShowBackToTop] = useState(false);

  const [stickyVisible, setStickyVisible] = useState(false);

  // Mirrors of the state above, read and written from the UI thread inside the
  // worklet below. React state can't be read there, and a plain ref written
  // from the UI thread wouldn't be visible to JS reliably.
  const headerHeightShared = useSharedValue(0);
  const stickyVisibleShared = useSharedValue(false);
  const showBackToTopShared = useSharedValue(false);
  const isFullScreenShared = useSharedValue(isFullScreen);
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
  useEffect(() => {
    if (activeTab !== "images") return;
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
        if (seq === imagesRequestRef.current) setImages([]);
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
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

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
    headerHeightShared.value = e.nativeEvent.layout.height;
  }, [headerHeightShared]);

  // Sticky bar + back-to-top, entirely on the UI thread. This used to be a
  // plain JS onScroll: every one of the profile's lists (Posts, Home, the
  // subscribers list, the image grid) crossed the bridge on every scroll
  // event, at any scroll speed, to run two threshold comparisons that only
  // ever changed state a few times per scroll. `onScroll` (the prop from
  // UserProfileBottomSheet) has always been a no-op stub — there is nothing
  // real to forward here, so this drops the per-frame JS hop entirely rather
  // than paying it to call a function that does nothing.
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (!isFullScreenShared.value) return;

      const y = event.contentOffset.y;

      const threshold = headerHeightShared.value;
      if (threshold > 0) {
        const shouldStick = y >= threshold;
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
  // Tab change handler — scroll back to top and reset sticky state
  const handleTabChange = useCallback(
    (tab: ContentTab) => {
      if (tab === activeTab) return;
      stickyVisibleShared.value = false;
      setStickyVisible(false);
      setActiveTab(tab);
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [activeTab, stickyVisibleShared],
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
    if (isBlocked) {
      return (
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="bg-theme-neutrals-800/50 rounded-2xl p-5 mb-5">
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
        <View className="bg-theme-neutrals-800/50 rounded-2xl p-5 mb-5">
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
        <View onLayout={handleHeaderLayout}>{profileHeader}</View>
        {TabBar}
        {ContentToolbar}
      </View>
    );
  }, [profileHeader, handleHeaderLayout, TabBar, ContentToolbar]);

  if (!address) return null;

  // Private account: show header + message, no feed
  if (!canViewContent) {
    return (
      <View style={isFullScreen ? { flex: 1 } : { height: listHeight }}>
        {isFullScreen && profileHeader}
        {PrivateAccountMessage}
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
  // Render content for the active tab — only one list/grid mounts at a time.
  // Previously all 5 tabs used `display: none` which kept every FlatList in the
  // view tree, wasting CPU (Yoga layout, reconciliation, effects) and GPU memory.
  const renderTabContent = () => {
    const mt = isFullScreen ? 0 : 4;
    switch (activeTab) {
      case "home":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <FeedRoute
              listRef={listRef}
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
              listRef={listRef}
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
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled}>
                {isFullScreen && fullScreenListHeader}
                <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color="#fff" /></View>
              </Animated.ScrollView>
            ) : images.length === 0 ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled}>
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
              listRef={listRef}
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
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled}>
                {isFullScreen && fullScreenListHeader}
                <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color="#fff" /></View>
              </Animated.ScrollView>
            ) : plans.length === 0 ? (
              <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16} scrollEnabled={scrollEnabled}>
                {isFullScreen && fullScreenListHeader}
              <ProfileEmptyState
                kind="subscribers"
                title={t("profile.noPlans")}
                subtitle={t("profile.noPlansSub")}
              />
              </Animated.ScrollView>
            ) : (
              <Animated.FlatList
                ref={listRef}
                ListHeaderComponent={isFullScreen ? fullScreenListHeader : undefined}
                data={plans}
                keyExtractor={(item: SubscriptionPlan) => String(item._id || item.id || Math.random())}
                renderItem={({ item }: { item: SubscriptionPlan }) => <View style={{ paddingHorizontal: CONTENT_PX, marginBottom: 8 }}><PlanCard plan={item} /></View>}
                scrollEnabled={scrollEnabled}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={isFullScreen ? LIST_CONTENT_STYLE : LIST_CONTENT_STYLE_COLLAPSED}
              />
            )}
          </View>
        );
      case "videos":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <VideosRoute listRef={listRef} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} {...contentQuery} />
          </View>
        );
      case "songs":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <ProfileFeedTypeRoute
              listRef={listRef}
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
            <LivestreamsRoute listRef={listRef} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "fractions":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <FractionsRoute listRef={listRef} address={address} isOwnProfile={isOwnProfile} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "pinned":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <PinnedRoute listRef={listRef} address={address} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
          </View>
        );
      case "playlists":
        return (
          <View style={{ flex: 1, marginTop: mt }}>
            <PlaylistsRoute listRef={listRef} address={address} isOwnProfile={isOwnProfile} onBeforeNavigate={onClose} onScroll={scrollHandler} listHeader={isFullScreen ? fullScreenListHeader : undefined} />
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
      {renderTabContent()}

      {isFullScreen && stickyVisible && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: STICKY_BAR_HEIGHT,
            zIndex: 10,
            elevation: 10,
            backgroundColor: theme.colors.neutrals[900],
          }}
        >
          {TabBar}
        </View>
      )}

      {isFullScreen && showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel={t("profile.backToTop")}
          className="absolute bottom-6 right-5 bg-theme-neutrals-800/90 rounded-xl p-3 active:opacity-80"
          style={{
            zIndex: 20,
            elevation: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
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
