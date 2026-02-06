import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "../../theme";

type CategorySelectorProps = {
  categories: string[];
  selectedCategory: string;
  onCategoryPress: (category: string) => void;
  // Optional: callback when filter icon is pressed
  onFilterPress?: () => void;
  // Whether filter panel is currently open
  isFilterOpen?: boolean;
};

const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategory,
  onCategoryPress,
  onFilterPress,
  isFilterOpen = false,
}) => {
  // Reorder categories so selected category appears first (after All/Live)
  const orderedCategories = React.useMemo(() => {
    if (selectedCategory === "All" || !categories.includes(selectedCategory)) {
      return categories;
    }
    // Put selected category first (after "All" which is always first)
    const filtered = categories.filter((c) => c !== selectedCategory && c !== "All");
    return ["All", selectedCategory, ...filtered];
  }, [categories, selectedCategory]);

  return (
    <View className="h-12">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
        className="flex-row py-2 bg-theme-neutrals-900"
      >
        {/* Filter icon pill - shows close icon when filter is open */}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isFilterOpen ? "Close filter options" : "Open filter options"}
          onPress={onFilterPress}
          className={`w-8 h-8 items-center justify-center rounded-full mr-2 ${
            isFilterOpen ? "bg-theme-neutrals-100" : "bg-theme-neutrals-800"
          }`}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons
            name={isFilterOpen ? "close" : "options-outline"}
            size={18}
            color={isFilterOpen ? theme.colors.background : theme.colors.mutedForeground}
          />
        </TouchableOpacity>

        {orderedCategories.map((category, index) => {
          const isAll = category === "All";
          const isSelected = selectedCategory === category;
          return (
            <TouchableOpacity
              key={`cat-${index}-${category}`}
              className={`px-4 h-8 items-center justify-center rounded-full mr-2 bg-theme-neutrals-800 ${
                isSelected && !isAll ? "border border-theme-neutrals-400" : ""
              }`}
              onPress={() => onCategoryPress(category)}
            >
              <Text
                className={`text-sm font-medium text-theme-neutrals-400`}
                style={{ includeFontPadding: false, lineHeight: 18 }}
              >
                {category}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default CategorySelector;
