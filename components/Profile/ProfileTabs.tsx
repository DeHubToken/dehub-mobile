import CollapsingProfileHeader from './CollapsingProfileHeader';
import ProfileScrollViewport from './ProfileScrollViewport';
import { PROFILE_BAR_HEIGHT, PROFILE_TABS_TOP_GAP, useProfileCollapse } from './useProfileCollapse';
import { getCoverUrl, getDefaultBanner } from '../../libs/misc';
import ProfilePinnedBar from './ProfilePinnedBar';
import { useTranslation as _useCopy } from 'react-i18next';
import React, { Activity, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import Animated, { runOnJS, runOnUI, useSharedValue, useAnimatedScrollHandler, useAnimatedStyle } from "react-native-reanimated";
import { useTranslation } from "react-i18next";

import ProfileHeader from "./ProfileHeader";
import type { IconName } from "../ui/Icon";
import PinnedCommunities from "../Communities/PinnedCommunities";
import FeedRoute from "./FeedRoute";
import ImagesRoute from "./ImagesRoute";
import VideosRoute from "./VideosRoute";
import LivestreamsRoute from "./LivestreamsRoute";
import ProfileFeedTypeRoute from "./ProfileFeedTypeRoute";
import PostsRoute from "./PostsRoute";
import SubscribersRoute from "./SubscribersRoute";
import PinnedRoute from "./PinnedRoute";
import PlaylistsRoute from "./PlaylistsRoute";
import DislikesRoute from "./DislikesRoute";
import FractionsRoute from "./FractionsRoute";
import ProfileTabBar, { type ProfileTabItem } from "./ProfileTabBar";
import ProfileContentToolbar from "./ProfileContentToolbar";
import ProfileFilterDrawer from "./ProfileFilterDrawer";
import {
  CONTENT_BACKED_TABS,
  useProfileContentFilters,
} from "./useProfileContentFilters";
import { useUser } from "../../context/AuthContext";
import { useProfileContentCounts } from "./useProfileContentCounts";
import { useTabBarScrollHide } from "../../hooks/useTabBarScrollHide";
import { getDefaultProfileTab } from "../../libs/profile-default-tab";

type ProfileRoute = { key: string; title: string; icon: IconName };

/** Opened tabs kept mounted (hidden), the active one included. */
const MAX_KEPT_TABS = 4;

const ProfileTabs = ({ canGoBack, onBackPress }: { canGoBack: boolean; onBackPress: () => void }) => {
  const { t: _copy } = _useCopy();
  const user = useUser() as any;
  const { t } = useTranslation();
  const address = useMemo(
    () => user?.walletAddress || user?.address || undefined,
    [user],
  );
  const counts = useProfileContentCounts(address);
  const collapse = useProfileCollapse(address);
  const profileScrollY = collapse.scrollY;
  const headerHeight = useSharedValue(0);
  const tabsStuck = collapse.tabsPinned;
  const [stickyVisible, setStickyVisible] = useState(false);
  const stickyStyle = useAnimatedStyle(() => ({ opacity: tabsStuck.value ? 1 : 0 }));
  // Keep the header's layout for scroll position, but stop drawing its masked
  // artwork once the joined navigation fully covers it.
  const expandedHeaderStyle = useAnimatedStyle(() => ({ opacity: tabsStuck.value ? 0 : 1 }));
  const ownDefaultTab = getDefaultProfileTab(user);
  const [activeKey, setActiveKey] = useState<string>(ownDefaultTab);
  // Your own profile opens on the tab you picked for visitors, so you see it
  // the way they do. Re-applied only when the account or the choice changes,
  // so tapping other tabs afterwards sticks.
  const appliedDefaultFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${address}|${ownDefaultTab}`;
    if (!address || appliedDefaultFor.current === key) return;
    appliedDefaultFor.current = key;
    setActiveKey(ownDefaultTab);
  }, [address, ownDefaultTab]);
  // Opened tabs stay mounted but hidden (most recent last), so going back to
  // one is instant and lands where it was left. tabOffsets remembers where.
  const [keptKeys, setKeptKeys] = useState<{ address?: string; keys: string[] }>({ address, keys: [] });
  useEffect(() => {
    setKeptKeys((kept) => {
      const keys = kept.address === address ? kept.keys : [];
      if (kept.address === address && keys[keys.length - 1] === activeKey) return kept;
      return { address, keys: [...keys.filter((key) => key !== activeKey), activeKey].slice(-MAX_KEPT_TABS) };
    });
  }, [activeKey, address]);
  const paneKeys = keptKeys.address === address
    ? keptKeys.keys.includes(activeKey) ? keptKeys.keys : [...keptKeys.keys, activeKey]
    : [activeKey];
  const activeKeyShared = useSharedValue(activeKey);
  const tabOffsets = useSharedValue<Record<string, number>>({});
  useEffect(() => {
    tabOffsets.value = {};
  }, [address, tabOffsets]);
  const { drive } = useTabBarScrollHide();
  const driveProfile = useCallback((y: number) => {
    'worklet';
    drive(y);
    profileScrollY.value = y;
    const key = activeKeyShared.value;
    if (tabOffsets.value[key] !== y) {
      tabOffsets.modify((offsets) => {
        'worklet';
        (offsets as Record<string, number>)[key] = y;
        return offsets;
      });
    }
    const stuck = headerHeight.value > 0 && y >= headerHeight.value + PROFILE_TABS_TOP_GAP - 4;
    if (stuck !== tabsStuck.value) {
      tabsStuck.value = stuck;
      runOnJS(setStickyVisible)(stuck);
    }
  }, [drive, profileScrollY, headerHeight, tabsStuck, activeKeyShared, tabOffsets]);
  const workletScroll = useAnimatedScrollHandler({ onScroll: (event) => driveProfile(event.contentOffset.y) });
  const onScroll = useCallback((event: import('react-native').NativeSyntheticEvent<import('react-native').NativeScrollEvent>) => driveProfile(event.nativeEvent.contentOffset.y), [driveProfile]);
  // Sort, search and filter over this creator's own posts — all server-side,
  // and shared with the other-user profile sheet so the two never drift.
  const { toolbar, panel, contentQuery, homePostType } =
    useProfileContentFilters(activeKey, address);

  // Keep the same information architecture as web: All stays first and the
  // remaining tabs are ordered by their content count.
  const routes = useMemo<ProfileRoute[]>(() => {
    const home: ProfileRoute = {
      key: "home",
      title: t("profile.tabHome", "All"),
      icon: "House",
    };
    const rest: ProfileRoute[] = [
      { key: "posts", title: t("profile.tabPosts", "Posts"), icon: "MessageSquare" },
      { key: "images", title: t("profile.tabImages", "Images"), icon: "Image" },
      { key: "videos", title: t("profile.tabVideos", "Videos"), icon: "Film" },
      { key: "subscribers", title: t("profile.tabSubscribers", "Subs"), icon: "Star" },
      { key: "songs", title: t("profile.tabAudio", "Audio"), icon: "Play" },
      { key: "live", title: t("profile.tabLive", "Live"), icon: "Radio" },
      { key: "fractions", title: _copy("copy.487aaa977933", { defaultValue: "Fractions" }), icon: "ChartPie" },
      { key: "pinned", title: t("profile.tabPinned", "Pinned"), icon: "Pin" },
    ];
    // Public playlists only earn a tab once there is one to show.
    if ((counts.playlists ?? 0) > 0) {
      rest.push({ key: "playlists", title: t("profile.tabPlaylists"), icon: "ListVideo" });
    }
    rest.sort(
      (a, b) =>
        ((counts as Record<string, number | undefined>)[b.key] ?? 0) -
        ((counts as Record<string, number | undefined>)[a.key] ?? 0),
    );
    // Your own Dislikes are always here, last: they are what you turned away, not what you made.
    return [home, ...rest, { key: "dislikes", title: t("profile.tabDislikes"), icon: "ThumbsDown" }];
  }, [counts, t, _copy]);

  const tabItems = useMemo<ProfileTabItem[]>(
    () =>
      routes.map((route) => ({
        key: route.key,
        label: route.title,
        icon: route.icon,
        count: (counts as Record<string, number | undefined>)[route.key] ?? 0,
      })),
    [counts, routes],
  );

  const handleTabChange = useCallback((key: string) => {
    if (key === activeKey) return;
    setActiveKey(key);
  }, [activeKey]);

  // The pinned bar and the collapse follow the tab now on screen: a kept tab
  // comes back at its own offset, a new one at the top.
  useEffect(() => {
    activeKeyShared.value = activeKey;
    runOnUI((key: string) => {
      'worklet';
      const y = tabOffsets.value[key] ?? 0;
      profileScrollY.value = y;
      const stuck = headerHeight.value > 0 && y >= headerHeight.value + PROFILE_TABS_TOP_GAP - 4;
      tabsStuck.value = stuck;
      runOnJS(setStickyVisible)(stuck);
    })(activeKey);
  }, [activeKey, address, activeKeyShared, tabOffsets, profileScrollY, headerHeight, tabsStuck]);

  // Memoised: a new header element made the list re-render the whole profile
  // header every time this screen rendered, mid-fling included.
  const listHeader = useMemo(() => (
    <View>
      {/* A kept tab's copy of the header measures 0 while that tab is hidden. */}
      <Animated.View style={expandedHeaderStyle} onLayout={(event) => { const height = event.nativeEvent.layout.height; if (height > 0) headerHeight.value = height; }}><PinnedCommunities
        walletAddress={address || ""}
        isOwnProfile
        renderHeader={(community) => <ProfileHeader featuredCommunity={community} onIdentityBottom={collapse.onIdentityBottom} onActionsBottom={collapse.onActionsBottom} />}
      /></Animated.View>
      <ProfileTabBar
        items={tabItems}
        activeKey={activeKey}
        onChange={handleTabChange}
      />
      {/* Only on the tabs actually served by this creator's content query.
          Subscriptions, live, fractions and pinned come from their own
          endpoints, where sorting by "most viewed" would do nothing. */}
      {CONTENT_BACKED_TABS.includes(activeKey) && (
        <>
          <ProfileContentToolbar {...toolbar} />
          <ProfileFilterDrawer {...panel} onClose={toolbar.onFiltersClose} />
        </>
      )}
    </View>
  ), [expandedHeaderStyle, headerHeight, address, collapse.onIdentityBottom, collapse.onActionsBottom, tabItems, activeKey, handleTabChange, toolbar, panel]);

  const renderScene = (key: string) => {
    switch (key) {
      case "home":
        return <FeedRoute address={address} listHeader={listHeader} onScroll={workletScroll} postType={homePostType} {...contentQuery} />;
      case "posts":
        return <PostsRoute address={address} listHeader={listHeader} onScroll={workletScroll} />;
      case "images":
        return <ImagesRoute address={address} listHeader={listHeader} onScroll={onScroll} {...contentQuery} />;
      case "videos":
        return <VideosRoute address={address} listHeader={listHeader} onScroll={workletScroll} {...contentQuery} />;
      case "subscribers":
        return <SubscribersRoute address={address} isOwnProfile listHeader={listHeader} onScroll={onScroll} />;
      case "songs":
        return <ProfileFeedTypeRoute address={address} postType="feed-audio" listHeader={listHeader} onScroll={workletScroll} />;
      case "live":
        return <LivestreamsRoute address={address} listHeader={listHeader} onScroll={workletScroll} />;
      case "fractions":
        return <FractionsRoute address={address} isOwnProfile listHeader={listHeader} onScroll={workletScroll} />;
      case "pinned":
        return <PinnedRoute address={address} listHeader={listHeader} onScroll={workletScroll} />;
      case "playlists":
        return <PlaylistsRoute address={address} listHeader={listHeader} onScroll={workletScroll} isOwnProfile />;
      case "dislikes":
        return <DislikesRoute address={address} listHeader={listHeader} onScroll={workletScroll} isOwnProfile />;
      default:
        return null;
    }
  };

  return <View className="flex-1 bg-theme-neutrals-900">
    <ProfileScrollViewport {...collapse}>
      {paneKeys.map((key) => (
        <Activity key={`${address}:${key}`} mode={key === activeKey ? "visible" : "hidden"}>
          <View style={{ flex: 1 }}>{renderScene(key)}</View>
        </Activity>
      ))}
    </ProfileScrollViewport>
    <Animated.View pointerEvents={stickyVisible ? 'auto' : 'none'} accessibilityElementsHidden={!stickyVisible} importantForAccessibility={stickyVisible ? 'auto' : 'no-hide-descendants'} style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40, elevation: 40 }, stickyStyle]}>
      <ProfilePinnedBar showIdentity={false} canGoBack={canGoBack} onBackPress={onBackPress}>
        <ProfileTabBar items={tabItems} activeKey={activeKey} onChange={handleTabChange} pinned embedded />
      </ProfilePinnedBar>
    </Animated.View>
    <CollapsingProfileHeader {...collapse} name={user?.displayName} handle={user?.username}
      cover={user?.coverImageUrl ? { uri: getCoverUrl(user.coverImageUrl) } : getDefaultBanner(address || '')}
      canGoBack={canGoBack} onBackPress={onBackPress} />
  </View>;
};

export default ProfileTabs;
