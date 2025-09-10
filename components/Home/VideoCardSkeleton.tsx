import React from 'react';
import { View } from 'react-native';

interface VideoCardSkeletonProps {
  count?: number;
}

/**
 * Structured skeleton placeholders for video cards.
 * Mirrors the layout of `VideoCard` (thumbnail + meta rows).
 */
const VideoCardSkeleton: React.FC<VideoCardSkeletonProps> = ({ count = 4 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, idx) => (
        <View
          key={idx}
          className="bg-theme-neutrals-800 rounded-lg my-2 overflow-hidden animate-pulse"
        >
          {/* Thumbnail placeholder */}
          <View className="w-full h-48 bg-theme-neutrals-700" />

          {/* Meta section */}
          <View className="p-3">
            <View className="flex-row items-center mb-2">
              {/* Avatar circle */}
              <View className="w-8 h-8 rounded-full bg-theme-neutrals-700 mr-3" />
              <View className="flex-1">
                <View className="h-4 bg-theme-neutrals-700 rounded w-3/4 mb-2" />
                <View className="h-3 bg-theme-neutrals-700 rounded w-1/2" />
              </View>
            </View>
            <View className="flex-row justify-between items-center mt-2">
              <View className="flex-row items-center gap-2 w-1/2">
                <View className="h-3 bg-theme-neutrals-700 rounded flex-1" />
              </View>
              <View className="flex-row items-center gap-2 w-1/4">
                <View className="h-3 bg-theme-neutrals-700 rounded flex-1" />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
};

export default VideoCardSkeleton;
