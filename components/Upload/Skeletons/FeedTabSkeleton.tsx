import React from "react";
import { View } from "react-native";

type Props = {};

const FeedTabSkeleton: React.FC<Props> = () => {
  return (
    <View className="flex-1 bg-black px-4">
      <View className="mt-4 animate-pulse">
        <View className="h-10 w-40 rounded-lg bg-zinc-800 mb-3" />
        <View className="h-24 w-full rounded-lg bg-zinc-900 mb-3" />
        <View className="h-20 w-full rounded-lg bg-zinc-900 mb-3" />
        <View className="h-20 w-full rounded-lg bg-zinc-900 mb-3" />
      </View>
    </View>
  );
};

export default FeedTabSkeleton;
