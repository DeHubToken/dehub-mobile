/**
 * HomeFeedCardSkeleton - Skeleton loader for HomeFeedCard
 * Matches the actual FeedCard layout exactly
 */
import React, { memo } from "react";
import { View, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CONTENT_WIDTH = SCREEN_WIDTH - 32 - 24;

const HomeFeedCardSkeleton: React.FC = () => {
  return (
    <View
      className="my-1 p-3 rounded-xl"
      style={{ borderWidth: 1, borderColor: "#1D1F21" }}
    >
      {/* Header */}
      <View className="flex-row items-center pb-2">
        <View className="w-8 h-8 rounded-lg bg-[#1D1F21]" />
        <View className="ml-2 flex-1">
          <View className="w-24 h-3.5 bg-[#1D1F21] rounded" />
          <View className="w-16 h-2.5 bg-[#1D1F21] rounded mt-1" />
        </View>
        <View className="flex-row gap-1">
          <View className="w-4 h-4 bg-[#1D1F21] rounded" />
          <View className="w-4 h-4 bg-[#1D1F21] rounded" />
        </View>
      </View>

      {/* Content area */}
      <View
        className="mt-1 bg-[#1D1F21] rounded-xl"
        style={{ width: CONTENT_WIDTH, height: CONTENT_WIDTH * 0.75 }}
      />

      {/* Caption */}
      <View className="mt-2.5">
        <View className="w-3/4 h-3.5 bg-[#1D1F21] rounded" />
        <View className="w-1/2 h-3 bg-[#1D1F21] rounded mt-1.5" />
      </View>

      {/* Timestamp + views */}
      <View className="flex-row items-center gap-2 mt-1.5">
        <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
        <View className="w-1 h-1 rounded-full bg-[#1D1F21]" />
        <View className="w-8 h-2.5 bg-[#1D1F21] rounded" />
      </View>

      {/* Action bar */}
      <View className="flex-row items-center justify-between pt-2">
        <View className="flex-row items-center gap-4">
          <View className="flex-row items-center gap-1">
            <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
            <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
          </View>
          <View className="flex-row items-center gap-1">
            <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
            <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
          </View>
          <View className="flex-row items-center gap-1">
            <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
            <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
          </View>
          <View className="flex-row items-center gap-1">
            <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
            <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
          </View>
          <View className="flex-row items-center gap-1">
            <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
            <View className="w-5 h-2.5 bg-[#1D1F21] rounded" />
          </View>
        </View>
        <View className="flex-row items-center gap-4">
          <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
          <View className="w-[18px] h-[18px] bg-[#1D1F21] rounded" />
        </View>
      </View>
    </View>
  );
};

export default memo(HomeFeedCardSkeleton);
