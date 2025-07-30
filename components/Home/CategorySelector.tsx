import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../../theme';

type CategorySelectorProps = {
  categories: string[];
  selectedCategory: string;
  onCategoryPress: (category: string) => void;
};

const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategory,
  onCategoryPress,
}) => {
  return (
    <View className="h-12">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center' }}
        className="flex-row py-2 bg-theme-neutrals-900"
      >
        {categories.map((category, index) => (
          <TouchableOpacity
            key={index}
            className={`px-4 py-2 rounded-full mr-2 ${
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
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

export default CategorySelector;
