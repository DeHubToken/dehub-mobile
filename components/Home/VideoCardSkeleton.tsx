import React from 'react';
import { View } from 'react-native';

interface VideoCardSkeletonProps {
  count?: number;
}

/**
 * VideoCardSkeleton - matches VideoCard layout exactly
 */
const VideoCardSkeleton: React.FC<VideoCardSkeletonProps> = ({ count = 3 }) => {
  return (
    <View>
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

          {/* Video thumbnail - 16:9 aspect */}
          <View className="w-full h-48 bg-theme-neutrals-800 rounded-xl mt-2" />

          {/* Caption - title and description */}
          <View className="mt-3">
            <View className="w-4/5 h-4 bg-theme-neutrals-800 rounded" />
            <View className="w-3/5 h-3.5 bg-theme-neutrals-800 rounded mt-2" />
          </View>

          {/* Time and views row */}
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

export default VideoCardSkeleton;
