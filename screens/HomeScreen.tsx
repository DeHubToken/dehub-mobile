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
import { getCategories } from "../services/nft.service";

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

  const content = (
    <InfiniteVideoFeed
      params={feedParams}
      pageSize={10}
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
      const list = await getCategories();
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
        <TouchableOpacity
          style={[
            styles.statusFilterButton,
            selectedSortMode && styles.statusFilterButtonActive,
          ]}
          onPress={() => setStatusFilterVisible(true)}
        >
          <Ionicons
            name={getSelectedStatusIcon(selectedSortMode)}
            size={16}
            color={theme.colors.accentForeground}
          />
          <Text
            style={[
              styles.statusFilterText,
              selectedSortMode && styles.statusFilterTextActive,
            ]}
          >
            {getSelectedStatusLabel(selectedSortMode)}
          </Text>
          <Ionicons
            name="chevron-down-outline"
            size={16}
            color={theme.colors.accentForeground}
          />
        </TouchableOpacity>
        {categoriesLoading ? (
          <CategorySelectorSkeleton />
        ) : (
          <CategorySelector
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryPress={setSelectedCategory}
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
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },

  // Status Filter Button
  statusFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.muted,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    alignSelf: "flex-start",
  },
  statusFilterButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  statusFilterText: {
    color: theme.colors.foreground,
    fontSize: 14,
    fontWeight: "500",
    marginHorizontal: 8,
  },
  statusFilterTextActive: {
    color: theme.colors.accentForeground,
  },
});
