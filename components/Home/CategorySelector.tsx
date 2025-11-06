import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';

type CategorySelectorProps = {
  categories: string[];
  selectedCategory: string;
  onCategoryPress: (category: string) => void;
  // Optional: show a special "Live" status chip after "All"
  showLiveChip?: boolean;
  isLiveActive?: boolean;
  onPressLive?: () => void;
};

const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategory,
  onCategoryPress,
  showLiveChip = true,
  isLiveActive = false,
  onPressLive,
}) => {
  return (
    <View className="h-12">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center' }}
        className="flex-row py-2 bg-theme-neutrals-900"
      >
        {categories.map((category, index) => {
          const isAll = category === 'All';
          return (
            <React.Fragment key={`cat-${index}-${category}`}>
              <TouchableOpacity
                className={`px-4 h-8 items-center justify-center rounded-full mr-2 ${
                  selectedCategory === category
                    ? 'bg-theme-accent'
                    : 'bg-theme-neutrals-800'
                }`}
                onPress={() => onCategoryPress(category)}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedCategory === category
                      ? 'text-theme-accent-foreground'
                      : 'text-theme-neutrals-400'
                  }`}
                  style={{ includeFontPadding: false, lineHeight: 18 }}
                >
                  {category}
                </Text>
              </TouchableOpacity>

              {showLiveChip && isAll && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={onPressLive}
                  className={`flex-row items-center justify-center px-4 h-8 rounded-full mr-2 ${
                    isLiveActive ? 'bg-theme-accent' : 'bg-theme-neutrals-800'
                  }`}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <View className="mr-2">
                    <Ionicons name="ellipse" size={12} color={theme.colors.destructive} />
                  </View>
                  <Text
                    className={`text-sm font-medium ${
                      isLiveActive
                        ? 'text-theme-accent-foreground'
                        : 'text-theme-neutrals-300'
                    }`}
                    style={{ includeFontPadding: false, lineHeight: 18 }}
                  >
                    Live
                  </Text>
                </TouchableOpacity>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default CategorySelector;
