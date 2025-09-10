import React, { memo } from "react";
import { View } from "react-native";

interface CompactVideoCardSkeletonProps {
  animate?: boolean; // reserved for future shimmer
}

const CompactVideoCardSkeletonComponent: React.FC<CompactVideoCardSkeletonProps> = () => {
  return (
    <View className="m-1 px-2 py-2">
      <View className="bg-theme-neutrals-900 rounded-lg overflow-hidden flex-row items-center p-2 border border-theme-neutrals-700">
        <View className="w-20 h-20 rounded-md bg-theme-neutrals-700" />
        <View className="flex-1 ml-3">
          <View className="h-3 w-3/4 bg-theme-neutrals-700 rounded mb-2" />
          <View className="h-3 w-1/2 bg-theme-neutrals-700 rounded mb-2" />
          <View className="h-3 w-1/3 bg-theme-neutrals-700 rounded" />
        </View>
      </View>
    </View>
  );
};

const CompactVideoCardSkeleton = memo(CompactVideoCardSkeletonComponent);
export default CompactVideoCardSkeleton;
