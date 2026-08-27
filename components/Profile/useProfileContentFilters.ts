import { useCallback, useEffect, useMemo, useState } from "react";

import type { FeedFilters } from "../Home/FeedFilterPanel";
import { getCategoriesCached } from "../../services/nft.service";
import { PROFILE_SORT_PARAMS, type ProfileSortMode } from "./ProfileContentToolbar";
import type {
  FeedPostType,
  FeedRange,
  FeedSortBy,
} from "../../services/feed.unified.service";

/**
 * Sort, search and filter state for a creator's channel, shared by the two
 * surfaces that show it: your own profile (`ProfileTabs`) and someone else's
 * (`UserProfile/UserProfileBottomContentTabs`).
 *
 * It lives in one hook rather than in both screens because the two must agree
 * — they render the same toolbar over the same endpoint, and the moment their
 * copies of this drift, one profile filters differently from the other. The
 * returned `toolbar` and `panel` bundles are meant to be spread straight onto
 * `ProfileContentToolbar` and `FeedFilterPanel`.
 *
 * Everything here is server-side: `/feed` takes the whole set next to
 * `minter`, and narrowing only the pages already downloaded would find just
 * what the reader had scrolled past.
 *
 * @module components/Profile/useProfileContentFilters
 */

/** Tabs served by the creator's own /feed query, and so by the toolbar. */
export const CONTENT_BACKED_TABS = ["home", "images", "videos"];

/**
 * `sortBy` is inert — the toolbar owns sorting and the panel's sort row is
 * hidden, because that row has no ascending direction and "oldest first" is one
 * of the four modes the profile offers.
 */
const EMPTY_PROFILE_FILTERS: FeedFilters = {
  sortBy: "createdAt",
  dateRange: "",
  postType: "all",
  contentAccess: [],
};

/**
 * Tall enough for every row the profile shows (category + date + post type +
 * access, no sort), because the panel's own scrolling is turned off on both
 * surfaces — see `innerScrollEnabled`. Raise it if a row is ever added.
 */
const PROFILE_FILTER_PANEL_HEIGHT = 420;

export interface ProfileContentQuery {
  sortBy: FeedSortBy;
  sortOrder: "asc" | "desc";
  search?: string;
  category?: string;
  range?: FeedRange;
  isPPV?: true;
  hasBounty?: true;
  isLocked?: true;
}

export function useProfileContentFilters(activeTab: string, resetKey?: string) {
  const [sort, setSort] = useState<ProfileSortMode>("newest");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(EMPTY_PROFILE_FILTERS);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    // A phone types a character at a time; without this every one is a request.
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  // A query typed on one channel has no meaning on the next, and neither does
  // a category the next creator never posts in. The sheet reuses one instance
  // across profiles, so without this the previous person's filters carry over.
  useEffect(() => {
    setSort("newest");
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY_PROFILE_FILTERS);
    setSelectedCategory("All");
    setFiltersOpen(false);
  }, [resetKey]);

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

  const handleFiltersToggle = useCallback(() => setFiltersOpen((open) => !open), []);

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
  const showPostType = activeTab === "home";

  const activeFilterCount =
    (selectedCategory !== "All" ? 1 : 0) +
    (filters.dateRange ? 1 : 0) +
    (showPostType && filters.postType !== "all" ? 1 : 0) +
    filters.contentAccess.length;

  const contentQuery = useMemo<ProfileContentQuery>(() => {
    const sortParams = PROFILE_SORT_PARAMS[sort];
    return {
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
  }, [sort, debouncedSearch, selectedCategory, filters.dateRange, filters.contentAccess]);

  const homePostType: FeedPostType = showPostType ? filters.postType : "all";

  const toolbar = {
    sort,
    onSortChange: setSort,
    search,
    onSearchChange: setSearch,
    filtersOpen,
    onFiltersToggle: handleFiltersToggle,
    activeFilterCount,
  };

  const panel = {
    visible: filtersOpen,
    filters,
    onFiltersChange: setFilters,
    categories,
    selectedCategory: selectedCategory === "All" ? undefined : selectedCategory,
    onCategoryPress: handleCategoryPress,
    onResetFilters: handleResetFilters,
    hidePostType: !showPostType,
    hideSort: true,
    maxHeight: PROFILE_FILTER_PANEL_HEIGHT,
    innerScrollEnabled: false,
  };

  return { toolbar, panel, contentQuery, homePostType };
}
