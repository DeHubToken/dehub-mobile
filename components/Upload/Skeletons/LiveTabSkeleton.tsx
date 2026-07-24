import React from "react";
import { View } from "react-native";

type Props = {};

const LiveTabSkeleton: React.FC<Props> = () => {
  return (
    <View className="flex-1 bg-black px-4">
      <View className="mt-3 flex-row justify-end">
        <View className="animate-pulse flex-row items-center px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800">
          <View className="w-3 h-3 rounded-full bg-zinc-700" />
          <View className="ml-2 w-20 h-3 rounded bg-zinc-800" />
        </View>
      </View>

      <View className="mt-4 animate-pulse">
        <View className="h-10 w-3/4 rounded-lg bg-zinc-800 mb-3" />
        <View className="h-24 w-full rounded-lg bg-zinc-900 mb-4" />

        <View className="h-8 w-32 rounded-full bg-zinc-800 mb-3" />
        <View className="flex-row flex-wrap">
          <View className="h-6 w-16 rounded-full bg-zinc-800 mr-2 mb-2" />
          <View className="h-6 w-20 rounded-full bg-zinc-800 mr-2 mb-2" />
          <View className="h-6 w-14 rounded-full bg-zinc-800 mr-2 mb-2" />
        </View>

        <View className="w-full aspect-video rounded-xl bg-zinc-900 border border-zinc-800 mb-4" />

        <View className="h-6 w-40 rounded bg-zinc-800 mb-2" />
        <View className="h-6 w-56 rounded bg-zinc-800 mb-2" />
        <View className="h-6 w-48 rounded bg-zinc-800 mb-4" />
      </View>

      <View className="px-0 pt-2 pb-6 mb-14">
        <View className="animate-pulse h-12 rounded-xl bg-zinc-800" />
      </View>
    </View>
  );
};

export default LiveTabSkeleton;
