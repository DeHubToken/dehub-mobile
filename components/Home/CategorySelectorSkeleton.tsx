import React from 'react';
import { View } from 'react-native';

// Skeleton chip widths (approximate variability)
const widths = [50, 80, 65, 100, 72, 54];

const CategorySelectorSkeleton: React.FC = () => {
  return (
    <View className="h-12 flex-row items-center py-2">
      <View className="flex-row px-0">
        {widths.map((w, i) => (
          <View
            key={i}
            style={{ width: w }}
            className="h-8 mr-2 rounded-full bg-theme-neutrals-800"
          />
        ))}
      </View>
    </View>
  );
};

export default CategorySelectorSkeleton;
