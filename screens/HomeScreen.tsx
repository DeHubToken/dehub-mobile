import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { theme } from "../theme";
import InfiniteVideoFeed from "../components/Home/InfiniteVideoFeed";
import HomeHeader from "../components/HomeHeader";
import CategorySelector from "../components/Home/CategorySelector";
import CategorySelectorSkeleton from "../components/Home/CategorySelectorSkeleton";
import FeedFilterPanel, { 
  FeedFilters, 
  SortOption, 
  DateRangeOption, 
  PostTypeOption 
} from "../components/Home/FeedFilterPanel";
import { getCategoriesCached } from "../services/nft.service";
import type { FeedRange, FeedSortBy, FeedPostType } from "../services/feed.unified.service";

const fallbackCategories = ["All"];

// Shuffle seed expiry time (30 minutes in ms)
const SHUFFLE_SEED_EXPIRY_MS = 30 * 60 * 1000;

// Generate a shuffle seed from timestamp
const generateShuffleSeed = () => String(Date.now());

// Default filter state - random sort by default
const defaultFilters: FeedFilters = {
  sortBy: "random",
  dateRange: "",
  postType: "all",
  contentAccess: [],
};

export default function HomeScreen() {
  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [filters, setFilters] = useState<FeedFilters>(defaultFilters);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(fallbackCategories);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  
  // Shuffle seed management
  const [shuffleSeed, setShuffleSeed] = useState<string>(generateShuffleSeed);
  const shuffleSeedTimestamp = useRef<number>(Date.now());

  // Check and refresh shuffle seed if expired
  useEffect(() => {
    const checkSeedExpiry = () => {
      const now = Date.now();
      if (now - shuffleSeedTimestamp.current >= SHUFFLE_SEED_EXPIRY_MS) {
        setShuffleSeed(generateShuffleSeed());
        shuffleSeedTimestamp.current = now;
      }
    };

    // Check on mount and set up interval
    checkSeedExpiry();
    const interval = setInterval(checkSeedExpiry, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Function to manually refresh the shuffle seed (called on pull-to-refresh)
  const refreshShuffleSeed = useCallback(() => {
    setShuffleSeed(generateShuffleSeed());
    shuffleSeedTimestamp.current = Date.now();
  }, []);

  // Convert filter panel state to API params
  const feedParams = useMemo(() => {
    const params: Record<string, any> = {
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sortBy: filters.sortBy as FeedSortBy,
      sortOrder: "desc" as const,
    };

    // Add shuffle seed for random sort
    if (filters.sortBy === "random") {
      params.shuffleSeed = shuffleSeed;
    }

    // Date range
    if (filters.dateRange) {
      params.range = filters.dateRange as FeedRange;
    }

    // Post type
    if (filters.postType !== "all") {
      params.postType = filters.postType as FeedPostType;
    }

    // Content access filters (multiple can be selected)
    if (filters.contentAccess.includes("ppv")) {
      params.isPPV = true;
    }
    if (filters.contentAccess.includes("bounty")) {
      params.hasBounty = true;
    }
    if (filters.contentAccess.includes("locked")) {
      params.isLocked = true;
    }

    return params;
  }, [selectedCategory, filters, shuffleSeed]);

  const handleFiltersChange = useCallback((newFilters: FeedFilters) => {
    setFilters(newFilters);
  }, []);

  const handleFilterPress = useCallback(() => {
    setFilterPanelVisible((prev) => !prev);
  }, []);

  // Close filter panel when scrolling starts
  const handleScrollBegin = useCallback(() => {
    if (filterPanelVisible) {
      setFilterPanelVisible(false);
    }
  }, [filterPanelVisible]);

  // Handle category selection from hashtag in feed cards
  const handleCategorySelect = useCallback((category: string) => {
    setSelectedCategory(category);
    setFilterPanelVisible(false);
  }, []);

  const content = (
    <InfiniteVideoFeed
      params={feedParams}
      pageSize={10}
      onRefresh={refreshShuffleSeed}
      onScrollBegin={handleScrollBegin}
      onCategorySelect={handleCategorySelect}
      onRetry={async () => {
        // Re-fetch categories on retry to restore the header chips when initial load failed
        setCategoriesLoading(true);
        try {
          const list = await getCategoriesCached({ forceRefresh: true });
          if (list && list.length) {
            const cleaned = [
              "All",
              ...list.filter((c) => c && c.toLowerCase() !== "all"),
            ];
            setCategories(cleaned);
            if (!cleaned.includes(selectedCategory)) setSelectedCategory("All");
          }
        } finally {
          setCategoriesLoading(false);
        }
      }}
      onClearFilters={() => {
        setSelectedCategory("All");
        setFilters(defaultFilters);
        refreshShuffleSeed();
      }}
    />
  );

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      setCategoriesLoading(true);
      const list = await getCategoriesCached();
      if (mounted && list && list.length) {
        // Ensure 'All' is first and unique
        const cleaned = [
          "All",
          ...list.filter((c) => c && c.toLowerCase() !== "all"),
        ];
        setCategories(cleaned);
        if (!cleaned.includes(selectedCategory)) setSelectedCategory("All");
      }
      setCategoriesLoading(false);
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // Custom handler for category press
  const handleCategoryPress = useCallback((cat: string) => {
    if (cat === selectedCategory) return;
    setSelectedCategory(cat);
    
    // Reset filters to default when "All" is selected
    if (cat === "All") {
      setFilters(defaultFilters);
    }
  }, [selectedCategory]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <HomeHeader />

      <View style={styles.filterSection}>
        {categoriesLoading ? (
          <CategorySelectorSkeleton />
        ) : (
          <CategorySelector
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryPress={handleCategoryPress}
            onFilterPress={handleFilterPress}
            isFilterOpen={filterPanelVisible}
          />
        )}
      </View>

      {/* Sliding filter panel */}
      <FeedFilterPanel
        visible={filterPanelVisible}
        filters={filters}
        onFiltersChange={handleFiltersChange}
      />

      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  // Filter Section Styles
  filterSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
});
