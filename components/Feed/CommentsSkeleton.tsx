import React from "react";
import { View } from "react-native";

const CommentsSkeleton: React.FC = () => (
  <View className="px-4 pt-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <View key={i} className="flex-row items-start gap-3 mb-5">
        {/* Squared like Avatar's default shape (size * 0.16), not a circle. */}
        <View className="w-7 h-7 rounded-[4px] bg-theme-neutrals-800" />
        <View className="flex-1">
          <View className="h-4 bg-theme-neutrals-800 rounded w-1/3 mb-1" />
          <View className="h-3 bg-theme-neutrals-800 rounded w-2/3 mb-2" />
          <View className="h-3 bg-theme-neutrals-800 rounded w-1/2 mb-2" />
          <View className="flex-row gap-2 mt-1">
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" />
            <View className="w-10 h-3 bg-theme-neutrals-800 rounded" />
          </View>
        </View>
      </View>
    ))}
  </View>
);

export default CommentsSkeleton;
