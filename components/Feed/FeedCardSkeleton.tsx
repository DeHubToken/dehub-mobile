import React from 'react';
import { View, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 32;

interface FeedCardSkeletonProps { count?: number }

/**
 * FeedCardSkeleton - matches HomeFeedCard layout for feed view
 */
const FeedCardSkeleton: React.FC<FeedCardSkeletonProps> = ({ count = 3 }) => {
  return (
    <View className="px-4">
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} className="my-4">
          {/* Header - matches FeedCardHeader */}
          <View className="flex-row items-center">
            {/* Avatar */}
            <View className="w-10 h-10 rounded-full bg-theme-neutrals-800" />
            <View className="ml-3 flex-1">
              {/* Display name */}
              <View className="w-28 h-4 bg-theme-neutrals-800 rounded" />
              {/* Username */}
              <View className="w-20 h-3 bg-theme-neutrals-800 rounded mt-1.5" />
            </View>
            {/* Badge */}
            <View className="w-6 h-6 rounded-full bg-theme-neutrals-800" />
          </View>
          
          {/* Image - square aspect ratio like carousel */}
          <View 
            className="mt-2 bg-theme-neutrals-800 rounded-xl"
            style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH }}
          />
          
          {/* Caption */}
          <View className="mt-3">
            <View className="w-4/5 h-4 bg-theme-neutrals-800 rounded" />
            <View className="w-3/5 h-3.5 bg-theme-neutrals-800 rounded mt-2" />
          </View>
          
          {/* Time and views */}
          <View className="flex-row items-center gap-2 mt-2">
            <View className="w-6 h-3 bg-theme-neutrals-800 rounded" />
            <View className="w-1 h-1 rounded-full bg-theme-neutrals-800" />
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" />
          </View>

          {/* Action bar */}
          <View className="flex-row items-center justify-between mt-3">
            <View className="flex-row items-center gap-4">
              {/* Like */}
              <View className="flex-row items-center gap-1">
                <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
                <View className="w-6 h-3 bg-theme-neutrals-800 rounded" />
              </View>
              {/* Dislike */}
              <View className="flex-row items-center gap-1">
                <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
                <View className="w-6 h-3 bg-theme-neutrals-800 rounded" />
              </View>
              {/* Comment */}
              <View className="flex-row items-center gap-1">
                <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
                <View className="w-6 h-3 bg-theme-neutrals-800 rounded" />
              </View>
              {/* Share */}
              <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
            </View>
            <View className="flex-row items-center gap-4">
              <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
              <View className="w-5 h-5 bg-theme-neutrals-800 rounded" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

export default FeedCardSkeleton;
