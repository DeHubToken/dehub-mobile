/**
 * FeedFilterPanel - Inline filter panel for the home feed
 * 
 * Slides down when the filter icon is pressed in the category selector.
 * Contains Sort, Upload Date, Post Type, and Content Access filters.
 * Uses Reanimated for smooth animations.
 */
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

export type SortOption = "random" | "createdAt" | "views" | "likes" | "comments";
export type DateRangeOption = "" | "day" | "week" | "month" | "year";
export type PostTypeOption = "all" | "video" | "feed-images" | "feed-audio" | "feed-simple" | "live";
export type ContentAccessOption = "ppv" | "bounty" | "locked";

export interface FeedFilters {
  sortBy: SortOption;
  dateRange: DateRangeOption;
  postType: PostTypeOption;
  contentAccess: ContentAccessOption[];
}

interface FeedFilterPanelProps {
  visible: boolean;
  filters: FeedFilters;
  onFiltersChange: (filters: FeedFilters) => void;
  /** Hide the Post Type filter section */
  hidePostType?: boolean;
  /** Hide the Content Access filter section */
  hideContentAccess?: boolean;
}

const sortOptions: { id: SortOption; label: string }[] = [
  { id: "random", label: "Random" },
  { id: "createdAt", label: "Latest" },
  { id: "views", label: "Most Viewed" },
  { id: "likes", label: "Most Liked" },
  { id: "comments", label: "Most Comments" },
];

const dateRangeOptions: { id: DateRangeOption; label: string }[] = [
  { id: "", label: "All time" },
  { id: "day", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "year", label: "This year" },
];

const postTypeOptions: { id: PostTypeOption; label: string }[] = [
  { id: "all", label: "All" },
  { id: "video", label: "Videos" },
  { id: "feed-images", label: "Images" },
  { id: "feed-audio", label: "Audio" },
  { id: "feed-simple", label: "Text" },
  { id: "live", label: "Live" },
];

const contentAccessOptions: { id: ContentAccessOption; label: string }[] = [
  { id: "ppv", label: "PPV" },
  { id: "bounty", label: "Bounty" },
  { id: "locked", label: "Locked" },
];

// Estimated max height for the panel content
const MAX_HEIGHT = 280;

interface FilterPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

const FilterPill: React.FC<FilterPillProps> = memo(({ label, selected, onPress }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`px-3 py-1.5 rounded-full mr-2 mb-2 ${
        selected
          ? "bg-theme-neutrals-100"
          : "bg-theme-neutrals-800"
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          selected ? "text-theme-neutrals-900" : "text-theme-neutrals-300"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
});

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
}

const FilterSection: React.FC<FilterSectionProps> = memo(({ title, children }) => {
  return (
    <View className="mb-3">
      <Text className="text-[10px] text-theme-neutrals-500 uppercase tracking-wider mb-2">
        {title}
      </Text>
      <View className="flex-row flex-wrap">
        {children}
      </View>
    </View>
  );
});

const FeedFilterPanelComponent: React.FC<FeedFilterPanelProps> = ({
  visible,
  filters,
  onFiltersChange,
  hidePostType = false,
  hideContentAccess = false,
}) => {
  // Calculate dynamic height based on visible sections
  // Base height (Sort + Upload Date) ~180px to account for wrapping, each additional section ~70px
  const dynamicMaxHeight = useMemo(() => {
    let height = 180; // Sort + Upload Date sections (with wrapping)
    if (!hidePostType) height += 70;
    if (!hideContentAccess) height += 60;
    return height;
  }, [hidePostType, hideContentAccess]);

  // Shared value for visibility animation
  const isVisible = useSharedValue(visible ? 1 : 0);

  // Sync shared value with prop
  useEffect(() => {
    isVisible.value = visible ? 1 : 0;
  }, [visible, isVisible]);

  // Animated styles using Reanimated
  const animatedStyle = useAnimatedStyle(() => {
    const targetHeight = isVisible.value ? dynamicMaxHeight : 0;
    const targetOpacity = isVisible.value ? 1 : 0;
    return {
      height: withTiming(targetHeight, {
        duration: 250,
        easing: Easing.bezier(0.25, 0.1, 0.25, 1),
      }),
      opacity: withTiming(targetOpacity, {
        duration: 200,
        easing: Easing.ease,
      }),
    };
  });

  const handleSortChange = useCallback((sortBy: SortOption) => {
    onFiltersChange({ ...filters, sortBy });
  }, [filters, onFiltersChange]);

  const handleDateRangeChange = useCallback((dateRange: DateRangeOption) => {
    onFiltersChange({ ...filters, dateRange });
  }, [filters, onFiltersChange]);

  const handlePostTypeChange = useCallback((postType: PostTypeOption) => {
    onFiltersChange({ ...filters, postType });
  }, [filters, onFiltersChange]);

  const handleContentAccessToggle = useCallback((option: ContentAccessOption) => {
    const current = filters.contentAccess;
    const newAccess = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onFiltersChange({ ...filters, contentAccess: newAccess });
  }, [filters, onFiltersChange]);

  return (
    <Animated.View
      style={[animatedStyle, { overflow: "hidden" }]}
      className="bg-theme-neutrals-900 px-4"
    >
      <View className="pt-2 pb-4">
        {/* Sort */}
        <FilterSection title="Sort">
          {sortOptions.map((option) => (
            <FilterPill
              key={option.id}
              label={option.label}
              selected={filters.sortBy === option.id}
              onPress={() => handleSortChange(option.id)}
            />
          ))}
        </FilterSection>

        {/* Upload Date */}
        <FilterSection title="Upload Date">
          {dateRangeOptions.map((option) => (
            <FilterPill
              key={option.id || "all"}
              label={option.label}
              selected={filters.dateRange === option.id}
              onPress={() => handleDateRangeChange(option.id)}
            />
          ))}
        </FilterSection>

        {/* Post Type */}
        {!hidePostType && (
          <FilterSection title="Post Type">
            {postTypeOptions.map((option) => (
              <FilterPill
                key={option.id}
                label={option.label}
                selected={filters.postType === option.id}
                onPress={() => handlePostTypeChange(option.id)}
              />
            ))}
          </FilterSection>
        )}

        {/* Content Access */}
        {!hideContentAccess && (
          <FilterSection title="Content Access">
            {contentAccessOptions.map((option) => (
              <FilterPill
                key={option.id}
                label={option.label}
                selected={filters.contentAccess.includes(option.id)}
                onPress={() => handleContentAccessToggle(option.id)}
              />
            ))}
          </FilterSection>
        )}
      </View>
    </Animated.View>
  );
};

export const FeedFilterPanel = memo(FeedFilterPanelComponent);
export default FeedFilterPanel;
