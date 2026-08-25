import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
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
import FractionsRoute from "./FractionsRoute";
import ProfileTabBar, { type ProfileTabItem } from "./ProfileTabBar";
import ProfileContentToolbar, {
  PROFILE_SORT_PARAMS,
  type ProfileSortMode,
} from "./ProfileContentToolbar";
import { useUser } from "../../context/AuthContext";
import { useProfileContentCounts } from "./useProfileContentCounts";
import BadgeProgress from "../Badge/BadgeProgress";
import { resolveBadgeBalance, resolveBadgeLock } from "../../libs/misc";

type ProfileRoute = { key: string; title: string; icon: IconName };

/** Tabs served by the creator's own /feed query, and so by the toolbar. */
const CONTENT_BACKED_TABS = ["home", "images", "videos"];

const ProfileTabs: React.FC = () => {
  const user = useUser() as any;
  const { t } = useTranslation();
  const address = useMemo(
    () => user?.walletAddress || user?.address || undefined,
    [user],
  );
  const counts = useProfileContentCounts(address);
  const [activeKey, setActiveKey] = useState("home");

  // Sort and search over this creator's own posts. Both are server-side:
  // ordering only what has already been downloaded would put the oldest
  // *loaded* post first rather than their first upload, and a search would
  // only ever find what the reader had already scrolled past.
  const [sort, setSort] = useState<ProfileSortMode>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    // A phone types a character at a time; without this every one is a request.
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const sortParams = PROFILE_SORT_PARAMS[sort];
  const contentQuery = {
    sortBy: sortParams.sortBy,
    sortOrder: sortParams.sortOrder,
    search: debouncedSearch || undefined,
  };

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
      { key: "fractions", title: "Fractions", icon: "ChartPie" },
      { key: "pinned", title: t("profile.tabPinned", "Pinned"), icon: "Pin" },
    ];
    rest.sort(
      (a, b) =>
        ((counts as Record<string, number | undefined>)[b.key] ?? 0) -
        ((counts as Record<string, number | undefined>)[a.key] ?? 0),
    );
    return [home, ...rest];
  }, [counts, t]);

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

  const handleTabChange = useCallback((key: string) => setActiveKey(key), []);

  const listHeader = (
    <View>
      <ProfileHeader />
      <View className="px-3 pb-3">
        {/* The ladder, on the one screen where the badge belongs to the person
            reading it. */}
        <BadgeProgress
          balance={resolveBadgeBalance(user as any)}
          lock={resolveBadgeLock(user as any)}
        />
      </View>
      <View className="px-3">
        <PinnedCommunities walletAddress={address || ""} isOwnProfile />
      </View>
      <ProfileTabBar
        items={tabItems}
        activeKey={activeKey}
        onChange={handleTabChange}
      />
      {/* Only on the tabs actually served by this creator's content query.
          Subscriptions, live, fractions and pinned come from their own
          endpoints, where sorting by "most viewed" would do nothing. */}
      {CONTENT_BACKED_TABS.includes(activeKey) && (
        <ProfileContentToolbar
          sort={sort}
          onSortChange={setSort}
          search={search}
          onSearchChange={setSearch}
        />
      )}
    </View>
  );

  const renderScene = (key: string) => {
    switch (key) {
      case "home":
        return <FeedRoute address={address} listHeader={listHeader} {...contentQuery} />;
      case "posts":
        return <PostsRoute address={address} listHeader={listHeader} />;
      case "images":
        return <ImagesRoute address={address} listHeader={listHeader} {...contentQuery} />;
      case "videos":
        return <VideosRoute address={address} listHeader={listHeader} {...contentQuery} />;
      case "subscribers":
        return <SubscribersRoute address={address} isOwnProfile listHeader={listHeader} />;
      case "songs":
        return <ProfileFeedTypeRoute address={address} postType="feed-audio" listHeader={listHeader} />;
      case "live":
        return <LivestreamsRoute address={address} listHeader={listHeader} />;
      case "fractions":
        return <FractionsRoute address={address} isOwnProfile listHeader={listHeader} />;
      case "pinned":
        return <PinnedRoute address={address} listHeader={listHeader} />;
      default:
        return null;
    }
  };

  return <View className="flex-1 bg-theme-neutrals-900">{renderScene(activeKey)}</View>;
};

export default ProfileTabs;
