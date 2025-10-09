import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../theme";
import StatusFilterBottomSheet from "../components/Home/StatusFilterBottomSheet";
import InfiniteVideoFeed from "../components/Home/InfiniteVideoFeed";
import HomeHeader from "../components/HomeHeader";
import { getSelectedStatusLabel, getSelectedStatusIcon } from "../libs";
import CategorySelector from "../components/Home/CategorySelector";
import CategorySelectorSkeleton from "../components/Home/CategorySelectorSkeleton";
import { getCategoriesCached } from "../services/nft.service";

const fallbackCategories = ["All"];

export default function HomeScreen() {
  const [statusFilterVisible, setStatusFilterVisible] = useState(false);
  const [selectedSortMode, setSelectedSortMode] = useState("trends"); // sortMode values
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>(fallbackCategories);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Filter section now static (animation removed)
  const feedParams = useMemo(
    () => ({
      category: selectedCategory !== "All" ? selectedCategory : undefined,
      sortMode: selectedSortMode || "trends",
    }),
    [selectedCategory, selectedSortMode]
  );

  const statusButton = (
    <TouchableOpacity
      onPress={() => setStatusFilterVisible(true)}
      className={`flex-row items-center self-start rounded-full px-3 py-2 mb-2 ${
        selectedSortMode ? 'bg-theme-neutrals-800' : 'bg-theme-neutrals-800'
      }`}
      accessibilityRole="button"
      accessibilityLabel="Open status filter"
    >
      <Ionicons
        name={getSelectedStatusIcon(selectedSortMode)}
        size={16}
        color={theme.colors.mutedForeground}
      />
      <Text
        className={`mx-2 text-sm font-medium ${
          selectedSortMode ? 'text-theme-neutrals-200' : 'text-theme-neutrals-300'
        }`}
      >
        {getSelectedStatusLabel(selectedSortMode)}
      </Text>
      <Ionicons
        name="chevron-down"
        size={14}
        color={theme.colors.mutedForeground}
      />
    </TouchableOpacity>
  );

  const content = (
    <InfiniteVideoFeed
      params={feedParams}
      pageSize={10}
      headerComponent={<View style={{ paddingHorizontal: 0, paddingTop: theme.spacing.xs }}>{statusButton}</View>}
      onClearFilters={() => {
        setSelectedCategory("All");
        setSelectedSortMode("trends");
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
            onCategoryPress={setSelectedCategory}
            showLiveChip
            isLiveActive={selectedSortMode === 'live'}
            onPressLive={() => {
              if (selectedSortMode === 'live') {
                setStatusFilterVisible(true);
              } else {
                setSelectedSortMode('live');
              }
            }}
          />
        )}
      </View>

      {content}

      <StatusFilterBottomSheet
        visible={statusFilterVisible}
        onClose={() => setStatusFilterVisible(false)}
        selectedSortMode={selectedSortMode}
        onSortModeChange={setSelectedSortMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  connectButtonGradient: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    justifyContent: "center",
    alignItems: "center",
  },

  // Filter Section Styles
  filterSection: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    // keep categories fixed at top; no bottom border
  },

  // Status button now styled via Tailwind className above; keep placeholders to satisfy StyleSheet type
  statusFilterButton: {},
  statusFilterButtonActive: {},
  statusFilterText: {},
  statusFilterTextActive: {},
});
