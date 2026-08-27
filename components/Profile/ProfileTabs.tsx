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
import FeedFilterPanel, { type FeedFilters } from "../Home/FeedFilterPanel";
import { getCategoriesCached } from "../../services/nft.service";
import { useUser } from "../../context/AuthContext";
import { useProfileContentCounts } from "./useProfileContentCounts";
import BadgeProgress from "../Badge/BadgeProgress";
import { resolveBadgeBalance, resolveBadgeLock } from "../../libs/misc";

type ProfileRoute = { key: string; title: string; icon: IconName };

/** Tabs served by the creator's own /feed query, and so by the toolbar. */
const CONTENT_BACKED_TABS = ["home", "images", "videos"];

/**
 * `sortBy` is inert here — the toolbar owns sorting and the panel's sort row is
 * hidden, because the row has no ascending option and "oldest first" is one of
 * the four modes the profile offers.
 */
const EMPTY_PROFILE_FILTERS: FeedFilters = {
  sortBy: "createdAt",
  dateRange: "",
  postType: "all",
  contentAccess: [],
};

/**
 * Tall enough for every row the profile shows (category + date + post type +
 * access, no sort), because the panel's own scrolling is turned off here — see
 * `innerScrollEnabled`. Raise it if a row is ever added.
 */
const PROFILE_FILTER_PANEL_HEIGHT = 420;

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

  // The home feed's filter panel, narrowed to this channel. Server-side too:
  // a category applied to the pages already downloaded would only ever find
  // what the reader had scrolled past.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_PROFILE_FILTERS);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    getCategoriesCached()
      .then((list) => {
        if (!mounted || !list?.length) return;
        setCategories(["All", ...list.filter((c) => c && c.toLowerCase() !== "all")]);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const handleCategoryPress = useCallback((category: string) => {
    setSelectedCategory((prev) => (prev === category ? "All" : category));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(EMPTY_PROFILE_FILTERS);
    setSelectedCategory("All");
  }, []);

  // Post type only means something on the All tab. Images and Videos ARE post
  // types, so a control that can contradict the tab would empty it with nothing
  // on screen to explain why. The choice is parked, not cleared, so coming back
  // to All restores it.
  const showPostType = activeKey === "home";

  const activeFilterCount =
    (selectedCategory !== "All" ? 1 : 0) +
    (filters.dateRange ? 1 : 0) +
    (showPostType && filters.postType !== "all" ? 1 : 0) +
    filters.contentAccess.length;

  const sortParams = PROFILE_SORT_PARAMS[sort];
  const contentQuery = {
    sortBy: sortParams.sortBy,
    sortOrder: sortParams.sortOrder,
    search: debouncedSearch || undefined,
    category: selectedCategory !== "All" ? selectedCategory : undefined,
    range: filters.dateRange || undefined,
    // Only ever true — `false` would exclude free posts rather than widen.
    isPPV: filters.contentAccess.includes("ppv") || undefined,
    hasBounty: filters.contentAccess.includes("bounty") || undefined,
    isLocked: filters.contentAccess.includes("locked") || undefined,
  };
  const homePostType = showPostType ? filters.postType : "all";

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
  const handleFiltersToggle = useCallback(() => setFiltersOpen((open) => !open), []);

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
        <>
          <ProfileContentToolbar
            sort={sort}
            onSortChange={setSort}
            search={search}
            onSearchChange={setSearch}
            filtersOpen={filtersOpen}
            onFiltersToggle={handleFiltersToggle}
            activeFilterCount={activeFilterCount}
          />
          <FeedFilterPanel
            visible={filtersOpen}
            filters={filters}
            onFiltersChange={setFilters}
            categories={categories}
            selectedCategory={selectedCategory === "All" ? undefined : selectedCategory}
            onCategoryPress={handleCategoryPress}
            onResetFilters={handleResetFilters}
            hidePostType={!showPostType}
            hideSort
            maxHeight={PROFILE_FILTER_PANEL_HEIGHT}
            innerScrollEnabled={false}
          />
        </>
      )}
    </View>
  );

  const renderScene = (key: string) => {
    switch (key) {
      case "home":
        return <FeedRoute address={address} listHeader={listHeader} postType={homePostType} {...contentQuery} />;
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
