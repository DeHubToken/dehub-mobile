import React from 'react';
import { View } from 'react-native';

const skeletonWidths = [60, 90, 70, 110, 80];

const CategoryChipsSkeleton: React.FC = () => {
  return (
    <View className="flex-row flex-wrap px-4 py-2">
      {skeletonWidths.map((w, i) => (
        <View
          key={i}
          style={{ width: w }}
          className="h-7 rounded-full bg-theme-neutrals-800 mr-2 mb-2"
        />
      ))}
    </View>
  );
};

export default CategoryChipsSkeleton;
