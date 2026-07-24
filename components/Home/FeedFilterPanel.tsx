import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useTranslation } from "react-i18next";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Icon from "../ui/Icon";
import GlassIndicator, { GLASS_SHADOW } from "../ui/GlassIndicator";

export type SortOption = "score" | "random" | "createdAt" | "views" | "likes" | "comments" | "tips";
export type DateRangeOption = "" | "day" | "week" | "month" | "year";
export type PostTypeOption = "all" | "video" | "feed-images" | "feed-audio" | "feed-simple" | "short" | "live";
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
  categories?: string[];
  selectedCategory?: string;
  onCategoryPress?: (category: string) => void;
  onResetFilters?: () => void;
}


const MAX_HEIGHT = 440;
const PILL_BORDER_RADIUS = 8;
const FADE_COLORS: [string, string] = ["transparent", "#000000"];

interface GlassPillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

const GlassPill: React.FC<GlassPillProps> = memo(({ label, selected, onPress }) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={[
      pillStyles.base,
      selected ? [pillStyles.active, GLASS_SHADOW] : pillStyles.inactive,
    ]}
  >
    {selected && <GlassIndicator borderRadius={PILL_BORDER_RADIUS} />}
    <Text
      style={[
        pillStyles.text,
        selected ? pillStyles.textActive : pillStyles.textInactive,
      ]}
    >
      {label}
    </Text>
  </TouchableOpacity>
));

const pillStyles = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: PILL_BORDER_RADIUS,
    marginRight: 6,
    overflow: "hidden",
  },
  // Web paints no background on either state: the active pill's glass comes
  // entirely from GlassIndicator, and an inactive one is bare text.
  active: {
    backgroundColor: "transparent",
  },
  inactive: {
    backgroundColor: "transparent",
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
  },
  textActive: {
    color: "#ffffff",
  },
  textInactive: {
    color: "#a1a1aa", // zinc-400
  },
});

interface GlassFilterRowProps {
  title: string;
  children: React.ReactNode;
}

const GlassFilterRow: React.FC<GlassFilterRowProps> = memo(({ title, children }) => (
  <View style={sectionStyles.section}>
    <Text style={sectionStyles.label}>{title}</Text>
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={sectionStyles.rowContent}
      >
        {children}
      </ScrollView>
      <LinearGradient
        colors={FADE_COLORS}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={sectionStyles.fade}
        pointerEvents="none"
      />
    </View>
  </View>
));

const sectionStyles = StyleSheet.create({
  section: {
    marginBottom: 16,
    gap: 8,
  },
  label: {
    fontSize: 11,
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontWeight: "600",
  },
  rowContent: {
    paddingLeft: 4,
    paddingRight: 24,
    paddingVertical: 4,
  },
  fade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 24,
  },
});

const FeedFilterPanelComponent: React.FC<FeedFilterPanelProps> = ({
  visible,
  filters,
  onFiltersChange,
  categories = [],
  selectedCategory,
  onCategoryPress,
  onResetFilters,
}) => {
  const { t } = useTranslation();
  const [categorySearch, setCategorySearch] = useState("");

  const SORT_OPTIONS = useMemo(() => [
    { id: "score" as SortOption, label: t("filters.forYou", "For You") },
    { id: "random" as SortOption, label: t("filters.random") },
    { id: "createdAt" as SortOption, label: t("filters.latest") },
    { id: "views" as SortOption, label: t("filters.mostViewed") },
    { id: "likes" as SortOption, label: t("filters.mostLiked") },
    { id: "comments" as SortOption, label: t("filters.mostComments") },
    { id: "tips" as SortOption, label: t("filters.mostTips") },
  ], [t]);

  const DATE_RANGE_OPTIONS = useMemo(() => [
    { id: "" as DateRangeOption, label: t("filters.all") },
    { id: "day" as DateRangeOption, label: "1d" },
    { id: "week" as DateRangeOption, label: "1w" },
    { id: "month" as DateRangeOption, label: "1m" },
    { id: "year" as DateRangeOption, label: "1y" },
  ], [t]);

  const POST_TYPE_OPTIONS = useMemo(() => [
    { id: "all" as PostTypeOption, label: t("filters.all") },
    { id: "video" as PostTypeOption, label: t("filters.videos") },
    { id: "feed-images" as PostTypeOption, label: t("filters.images") },
    { id: "feed-audio" as PostTypeOption, label: t("filters.audio") },
    { id: "feed-simple" as PostTypeOption, label: t("filters.text") },
    { id: "live" as PostTypeOption, label: t("filters.live") },
  ], [t]);

  const CONTENT_ACCESS_OPTIONS = useMemo(() => [
    { id: "ppv" as ContentAccessOption, label: t("filters.ppv") },
    { id: "bounty" as ContentAccessOption, label: t("filters.bounty") },
    { id: "locked" as ContentAccessOption, label: t("filters.locked") },
  ], [t]);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const query = categorySearch.toLowerCase();
    return categories.filter((c) => c.toLowerCase().includes(query));
  }, [categories, categorySearch]);

  const isVisible = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    isVisible.value = visible ? 1 : 0;
  }, [visible, isVisible]);

  const animatedStyle = useAnimatedStyle(() => {
    const targetHeight = isVisible.value ? MAX_HEIGHT : 0;
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

  const handleSelectCategory = useCallback((cat: string) => {
    onCategoryPress?.(cat);
    setCategorySearch("");
  }, [onCategoryPress]);

  return (
    <Animated.View
      style={[animatedStyle, panelStyles.outerWrap]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={panelStyles.content}
      >
        <GlassFilterRow title={t("filters.sort").toUpperCase()}>
          {SORT_OPTIONS.map((option) => (
            <GlassPill
              key={option.id}
              label={option.label}
              selected={filters.sortBy === option.id}
              onPress={() => handleSortChange(option.id)}
            />
          ))}
        </GlassFilterRow>

        {categories.length > 0 && (
          <View style={sectionStyles.section}>
            <Text style={sectionStyles.label}>{t("filters.category").toUpperCase()}</Text>
            <TextInput
              value={categorySearch}
              onChangeText={setCategorySearch}
              placeholder={t("filters.searchCategories")}
              placeholderTextColor="#71717a"
              style={panelStyles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={sectionStyles.rowContent}
              >
                <GlassPill
                  label={t("filters.all")}
                  selected={!selectedCategory}
                  onPress={() => handleSelectCategory("All")}
                />
                {filteredCategories.map((cat) => (
                  <GlassPill
                    key={cat}
                    label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                    selected={selectedCategory === cat}
                    onPress={() => handleSelectCategory(cat)}
                  />
                ))}
                {filteredCategories.length === 0 && categorySearch.trim() && (
                  <Text style={panelStyles.noMatches}>{t("filters.noMatches")}</Text>
                )}
              </ScrollView>
              <LinearGradient
                colors={FADE_COLORS}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={sectionStyles.fade}
                pointerEvents="none"
              />
            </View>
          </View>
        )}

        <GlassFilterRow title={t("filters.uploadDate").toUpperCase()}>
          {DATE_RANGE_OPTIONS.map((option) => (
            <GlassPill
              key={option.id || "all"}
              label={option.label}
              selected={filters.dateRange === option.id}
              onPress={() => handleDateRangeChange(option.id)}
            />
          ))}
        </GlassFilterRow>

        <GlassFilterRow title={t("filters.postType").toUpperCase()}>
          {POST_TYPE_OPTIONS.map((option) => (
            <GlassPill
              key={option.id}
              label={option.label}
              selected={filters.postType === option.id}
              onPress={() => handlePostTypeChange(option.id)}
            />
          ))}
        </GlassFilterRow>

        <View style={[sectionStyles.section, { marginBottom: 0 }]}>
          <Text style={sectionStyles.label}>{t("filters.contentAccess").toUpperCase()}</Text>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={sectionStyles.rowContent}
            >
              {CONTENT_ACCESS_OPTIONS.map((option) => (
                <GlassPill
                  key={option.id}
                  label={option.label}
                  selected={filters.contentAccess.includes(option.id)}
                  onPress={() => handleContentAccessToggle(option.id)}
                />
              ))}
            </ScrollView>
            <LinearGradient
              colors={FADE_COLORS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={sectionStyles.fade}
              pointerEvents="none"
            />
          </View>
        </View>

        {onResetFilters && (
          <TouchableOpacity
            onPress={onResetFilters}
            activeOpacity={0.6}
            style={panelStyles.resetButton}
          >
            <Icon name="RefreshCw" size={14} color="#71717a" />
          </TouchableOpacity>
        )}
      </ScrollView>
    </Animated.View>
  );
};

const panelStyles = StyleSheet.create({
  outerWrap: {
    overflow: "hidden",
    backgroundColor: "#09090b",
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 12,
    marginHorizontal: 8,
  },
  content: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInput: {
    backgroundColor: "#27272a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3f3f46",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 12,
    color: "#e4e4e7",
    marginBottom: 4,
  },
  noMatches: {
    fontSize: 12,
    color: "#71717a",
    paddingVertical: 6,
  },
  resetButton: {
    position: "absolute",
    bottom: 0,
    right: 0,
    padding: 6,
    borderRadius: 8,
  },
});

export const FeedFilterPanel = memo(FeedFilterPanelComponent);
export default FeedFilterPanel;
