import React from "react";
import { View } from "react-native";

interface FeedCardSkeletonProps {
  count?: number;
}

const FeedCardSkeleton: React.FC<FeedCardSkeletonProps> = ({ count = 3 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, idx) => (
        <View key={idx} className="mb-3 p-3 rounded-2xl bg-theme-neutrals-900/40">
          {/* Header: avatar + name */}
          <View className="flex-row items-center mb-2">
            <View className="w-9 h-9 rounded-lg bg-theme-neutrals-800" />
            <View className="ml-2.5">
              <View className="w-24 h-3.5 bg-theme-neutrals-800 rounded" />
            </View>
          </View>

          {/* Content area */}
          <View className="w-full rounded-xl bg-theme-neutrals-800" style={{ aspectRatio: 4 / 3 }} />

          {/* Caption line */}
          <View className="w-3/5 h-3 bg-theme-neutrals-800 rounded mt-2.5" />

          {/* Action bar – just 3 circles */}
          <View className="flex-row items-center gap-5 mt-3">
            <View className="w-5 h-5 rounded-full bg-theme-neutrals-800" />
            <View className="w-5 h-5 rounded-full bg-theme-neutrals-800" />
            <View className="w-5 h-5 rounded-full bg-theme-neutrals-800" />
          </View>
        </View>
      ))}
    </View>
  );
};

export default FeedCardSkeleton;
