import React from 'react';
import { View } from 'react-native';

interface FeedCardSkeletonProps { count?: number }

const FeedCardSkeleton: React.FC<FeedCardSkeletonProps> = ({ count = 4 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} className="border border-theme-neutrals-800 rounded-2xl my-3 overflow-hidden">
          {/* Header skeleton */}
          <View className="px-3 pt-3 pb-1">
            <View className="flex-row items-center">
              <View className="w-7 h-7 rounded-full bg-theme-neutrals-800 mr-2" />
              <View className="flex-1">
                <View className="h-4 bg-theme-neutrals-800 rounded w-1/2 mb-1" />
                <View className="h-3 bg-theme-neutrals-800 rounded w-1/3" />
              </View>
            </View>
          </View>
          {/* Content skeleton */}
          <View className="px-3 py-2">
            <View className="h-4 bg-theme-neutrals-800 rounded w-11/12 mb-2" />
            <View className="h-4 bg-theme-neutrals-800 rounded w-9/12" />
          </View>
          {/* Image skeleton */}
          <View className="px-3 pb-2">
            <View className="w-full h-48 bg-theme-neutrals-800 rounded-xl" />
          </View>
          {/* Actions skeleton */}
          <View className="flex-row items-center justify-between px-3 py-3">
            <View className="w-16 h-4 bg-theme-neutrals-800 rounded" />
            <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
            <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
            <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
          </View>
        </View>
      ))}
    </View>
  );
};

export default FeedCardSkeleton;
