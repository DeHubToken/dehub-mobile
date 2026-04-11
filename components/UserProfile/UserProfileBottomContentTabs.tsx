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
  type ListRenderItemInfo,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Pressable,
  type LayoutChangeEvent,
  StyleSheet,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import Icon, { type IconName } from "../ui/Icon";
import FeedCard from "../Home/FeedCard";
import InfiniteFeed from "../Feed/InfiniteFeed";
import type { GetNFTsResult } from "../../services/nft.service";
import type { GetNFTsResponse } from "../../services/feed.service";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuthState } from "../../context/AuthContext";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { theme } from "../../theme";
import UserRepliesList, { type UserRepliesListRef } from "./UserRepliesList";
import UserRepostsList, { type UserRepostsListRef } from "./UserRepostsList";
import type { UserReplyItem } from "../../services/user.service";

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
}

const STICKY_BAR_HEIGHT = 48;
const SLIDE_TIMING = { duration: 200, easing: Easing.out(Easing.cubic) };

/** Horizontal padding for post cards — matches the profile header's px-5 (20px). */
const CONTENT_PX = 20;

/** Stable contentContainerStyle (same identity across renders to avoid FlatList churn). */
const LIST_CONTENT_STYLE = { paddingBottom: 80 } as const;
const LIST_CONTENT_STYLE_COLLAPSED = { paddingBottom: 24 } as const;

type ContentTab = "posts" | "replies" | "reposts";

const TAB_ITEMS: { key: ContentTab; label: string; icon: IconName }[] = [
  { key: "posts", label: "Posts", icon: "Grid3x3" },
  { key: "replies", label: "Replies", icon: "MessageSquare" },
  { key: "reposts", label: "Reposts", icon: "Repeat2" },
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
}) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const { isSignedIn } = useAuthState();
  const listRef = useRef<FlatList<any> | null>(null);
  const repliesListRef = useRef<UserRepliesListRef>(null);
  const repostsListRef = useRef<UserRepostsListRef>(null);

  // Active content tab
  const [activeTab, setActiveTab] = useState<ContentTab>("posts");

  // Track scroll offset for sticky bar + back-to-top
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Use ref for sticky to avoid stale closure in scroll handler
  const stickyVisibleRef = useRef(false);
  const [stickyVisible, setStickyVisible] = useState(false);

  // Height of the profile header (measured dynamically)
  const headerHeightRef = useRef(0);

  // Reset sticky state when switching between fullscreen and collapsed
  useEffect(() => {
    if (!isFullScreen) {
      stickyVisibleRef.current = false;
      setStickyVisible(false);
      setShowBackToTop(false);
    }
  }, [isFullScreen]);

  // When collapsed, constrain height; fullscreen fills available space
  const listHeight = useMemo(() => {
    if (isFullScreen) return undefined;
    const winH = Dimensions.get("window").height;
    return Math.min(560, Math.max(360, Math.round(winH * 0.55)));
  }, [isFullScreen]);

  // Custom fetcher that uses the /feed endpoint
  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      const res = await getUnifiedFeed({
        minter: address,
        postType: "all",
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "minted",
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address],
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  useEffect(() => {
    registerScrollToTop(scrollToTop);
    return () => {
      registerScrollToTop(null);
    };
  }, [registerScrollToTop, scrollToTop]);

  // Navigate to a post and highlight a specific comment (from Replies tab)
  const handleReplyItemPress = useCallback(
    (item: UserReplyItem) => {
      const tokenId = item.tokenId ?? item.post?.tokenId;
      if (!tokenId) return;
      const commentId = String(item.id);
      hideUserProfile();
      onClose();
      navigation.navigate(ScreenNames.FeedDetail as never, { tokenId, commentId } as never);
    },
    [navigation, hideUserProfile, onClose],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GetNFTsResult>) => {
      return (
        <View style={{ paddingHorizontal: CONTENT_PX }}>
          <FeedCard item={item as unknown as UnifiedFeedItem} onBeforeNavigate={onClose} />
        </View>
      );
    },
    [onClose],
  );

  // Measure profile header height to know when to show sticky bar
  const handleHeaderLayout = useCallback((e: LayoutChangeEvent) => {
    headerHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  // Combined scroll handler: drives the pan gesture hook + sticky/back-to-top
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;

      if (isFullScreen) {
        // Sticky tab bar: show when header + tab bar have scrolled out of view
        const threshold = headerHeightRef.current;
        if (threshold > 0) {
          const shouldStick = y >= threshold;
          if (shouldStick !== stickyVisibleRef.current) {
            stickyVisibleRef.current = shouldStick;
            setStickyVisible(shouldStick);
          }
        }

        // Back to top
        if (y > 600 && !showBackToTop) setShowBackToTop(true);
        else if (y <= 600 && showBackToTop) setShowBackToTop(false);
      }

      // Forward to parent's scroll handler (for bottom sheet pan coordination)
      onScroll(event);
    },
    [onScroll, isFullScreen, showBackToTop],
  );

  // Underline indicator for tabs
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const tabLayoutsRef = useRef<Record<string, { x: number; width: number }>>({});

  const handleTabLayout = useCallback(
    (key: ContentTab, x: number, width: number) => {
      tabLayoutsRef.current[key] = { x, width };
      if (key === activeTab) {
        pillX.value = x;
        pillW.value = width;
      }
    },
    [activeTab],
  );

  // Tab change handler — scroll back to top and reset sticky state
  const handleTabChange = useCallback(
    (tab: ContentTab) => {
      if (tab === activeTab) return;
      stickyVisibleRef.current = false;
      setStickyVisible(false);
      setActiveTab(tab);
      // Animate indicator
      const layout = tabLayoutsRef.current[tab];
      if (layout) {
        pillX.value = withTiming(layout.x, SLIDE_TIMING);
        pillW.value = withTiming(layout.width, SLIDE_TIMING);
      }
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    },
    [activeTab],
  );

  const indicatorStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    bottom: 0,
    left: pillX.value,
    width: pillW.value,
    height: 2,
    backgroundColor: "#fff",
    borderRadius: 1,
  }));

  // Clean underline tab bar
  const TabBar = useMemo(
    () => (
      <View
        style={{
          height: STICKY_BAR_HEIGHT,
          flexDirection: "row",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: "rgba(255,255,255,0.08)",
        }}
      >
        {TAB_ITEMS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handleTabChange(tab.key)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                handleTabLayout(tab.key, x, width);
              }}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon
                name={tab.icon}
                size={20}
                color={isActive ? "#fff" : "#52525b"}
              />
            </Pressable>
          );
        })}
        <Animated.View style={indicatorStyle} />
      </View>
    ),
    [activeTab, handleTabChange, handleTabLayout, indicatorStyle],
  );

  // Empty state for Reposts tab
  const RepostsEmptyState = useMemo(
    () => (
      <View className="flex-1 items-center justify-center px-8 py-16">
        <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
          <Icon name="Repeat2" size={40} color="#666" />
        </View>
        <Text className="text-white text-lg font-bold text-center mb-2">
          No Reposts Yet
        </Text>
        <Text className="text-gray-400 text-center text-sm leading-5">
          When this user reposts content, it'll show up here.
        </Text>
      </View>
    ),
    [],
  );

  // Private/blocked account message component
  const PrivateAccountMessage = useMemo(() => {
    if (canViewContent) return null;

    // Blocked state takes precedence over private
    if (isBlocked) {
      return (
        <View className="flex-1 items-center justify-center px-6 py-12">
          <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
            <Icon name="Ban" size={40} color="#666" />
          </View>
          {!youBlocked && (
            <Text className="text-white text-lg font-bold text-center mb-2">
              Content Unavailable
            </Text>
          )}
          <Text className="text-gray-400 text-center text-sm leading-5 mb-5">
            {youBlocked
              ? "You won't see their posts or be able to interact with them. Unblock to restore access."
              : "This user has restricted interactions with your account."}
          </Text>
        </View>
      );
    }

    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
          <Icon name="Lock" size={40} color="#666" />
        </View>
        <Text className="text-white text-lg font-bold text-center mb-2">
          This Account is Private
        </Text>
        <Text className="text-gray-400 text-center text-sm leading-5 mb-5">
          {isFollowRequestPending
            ? "Your follow request has been sent. You'll be able to see their posts once they approve your request."
            : "Follow this account to see their posts."}
        </Text>
        {!isFollowRequestPending && onFollow && (
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={onFollow}
              className="bg-transparent px-8 py-3 rounded-full"
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold text-sm">Follow</Text>
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

  // Simple white activity indicator for loading state (preserves header visibility)
  const postsLoadingComponent = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-16">
        <ActivityIndicator size="large" color="#fff" />
      </View>
    ),
    [],
  );

  // Fullscreen list header: profile header + optional Edit Profile + tab bar inside FlatList
  const fullScreenListHeader = useMemo(() => {
    if (!profileHeader) return undefined;
    return (
      <View onLayout={handleHeaderLayout}>
        {profileHeader}
        {isOwnProfile && isFullScreen && !!onEditProfile && (
          <View className="px-5 mt-2 mb-1">
            <TouchableOpacity
              onPress={onEditProfile}
              activeOpacity={0.8}
              className="flex-row items-center justify-center gap-2 border border-theme-neutrals-700 py-2 rounded-full"
            >
              <Icon name="Pencil" size={15} color="#e5e5e5" />
              <Text className="text-white text-sm font-semibold">
                Edit Profile
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {TabBar}
      </View>
    );
  }, [
    profileHeader,
    handleHeaderLayout,
    TabBar,
    isOwnProfile,
    isFullScreen,
    onEditProfile,
  ]);

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
  return (
    <View
      style={isFullScreen ? { flex: 1 } : { height: listHeight, marginTop: 16 }}
    >
      {!isFullScreen && TabBar}

      <View
        style={{
          flex: activeTab === "posts" ? 1 : 0,
          marginTop: isFullScreen ? 0 : (activeTab === "posts" ? 4 : 0),
          display: activeTab === "posts" ? "flex" : "none",
        }}
      >
        <InfiniteFeed
          insideNavigatorScreen={false}
          fetchPage={fetchPage}
          pageSize={20}
          isSignedIn={isSignedIn}
          contentContainerStyle={
            isFullScreen ? LIST_CONTENT_STYLE : LIST_CONTENT_STYLE_COLLAPSED
          }
          scrollEnabled={scrollEnabled}
          onScroll={handleScroll}
          listRef={listRef}
          enableBackToTop={false}
          renderItem={renderItem}
          headerComponent={isFullScreen ? fullScreenListHeader : undefined}
          loadingComponent={postsLoadingComponent}
        />
      </View>

      <View
        style={{
          flex: activeTab === "replies" ? 1 : 0,
          marginTop: isFullScreen ? 0 : (activeTab === "replies" ? 4 : 0),
          display: activeTab === "replies" ? "flex" : "none",
        }}
      >
        <UserRepliesList
          ref={repliesListRef}
          address={address}
          contentPadding={CONTENT_PX}
          scrollEnabled={scrollEnabled}
          onScroll={handleScroll}
          headerComponent={isFullScreen ? fullScreenListHeader : undefined}
          contentContainerStyle={
            isFullScreen ? LIST_CONTENT_STYLE : LIST_CONTENT_STYLE_COLLAPSED
          }
          onItemPress={handleReplyItemPress}
        />
      </View>

      <View
        style={{
          flex: activeTab === "reposts" ? 1 : 0,
          marginTop: isFullScreen ? 0 : (activeTab === "reposts" ? 4 : 0),
          display: activeTab === "reposts" ? "flex" : "none",
        }}
      >
        <UserRepostsList
          ref={repostsListRef}
          address={address}
          contentPadding={CONTENT_PX}
          scrollEnabled={scrollEnabled}
          onScroll={handleScroll}
          headerComponent={isFullScreen ? fullScreenListHeader : undefined}
          contentContainerStyle={
            isFullScreen ? LIST_CONTENT_STYLE : LIST_CONTENT_STYLE_COLLAPSED
          }
          onClose={onClose}
        />
      </View>

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
            backgroundColor: "#010305",
          }}
        >
          {TabBar}
        </View>
      )}

      {isFullScreen && showBackToTop && (
        <Pressable
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          className="absolute bottom-6 right-5 bg-theme-neutrals-800/90 rounded-full p-3 active:opacity-80"
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
            color={theme.colors.accentForeground || "#fff"}
          />
        </Pressable>
      )}
    </View>
  );
};

export default UserProfileBottomContentTabs;
