import React, { memo } from "react";
import { View } from "react-native";

/**
 * CompactVideoCardSkeleton - matches CompactVideoCard layout
 */
const CompactVideoCardSkeletonComponent: React.FC = () => {
  return (
    <View className="m-1 px-4 py-1">
      <View className="bg-theme-neutrals-900 rounded-xl overflow-hidden flex-row items-start p-2 border border-theme-neutrals-700">
        {/* Thumbnail - 16:9 aspect ratio */}
        <View 
          className="rounded-xl bg-theme-neutrals-800"
          style={{ width: 150, aspectRatio: 16 / 9 }}
        />
        
        {/* Content */}
        <View className="flex-1 ml-3 py-1">
          {/* Title - 2 lines */}
          <View className="w-full h-4 bg-theme-neutrals-800 rounded" />
          <View className="w-3/4 h-4 bg-theme-neutrals-800 rounded mt-1.5" />
          
          {/* Creator row */}
          <View className="flex-row items-center mt-2">
            <View className="w-20 h-3 bg-theme-neutrals-800 rounded" />
            <View className="w-4 h-4 rounded-full bg-theme-neutrals-800 ml-1.5" />
          </View>
          
          {/* Stats row - views, likes, time */}
          <View className="flex-row items-center mt-2 gap-3">
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" />
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" />
            <View className="w-12 h-3 bg-theme-neutrals-800 rounded" />
          </View>
        </View>
      </View>
    </View>
  );
};

const CompactVideoCardSkeleton = memo(CompactVideoCardSkeletonComponent);
export default CompactVideoCardSkeleton;
