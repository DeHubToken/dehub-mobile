import React from "react";
import { View, Dimensions } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMAGE_WIDTH = SCREEN_WIDTH - 32;

const AccountCardSkeleton: React.FC = () => (
  <View className="flex-row items-center px-4 py-3 border-b border-theme-neutrals-800">
    {/* Avatar */}
    <View className="w-12 h-12 rounded-full bg-theme-neutrals-800" />
    <View className="flex-1 ml-3">
      {/* Display name */}
      <View className="w-32 h-4 bg-theme-neutrals-800 rounded" />
      {/* Username */}
      <View className="w-24 h-3 bg-theme-neutrals-800 rounded mt-1.5" />
    </View>
    {/* Follow button */}
    <View className="w-20 h-8 bg-theme-neutrals-800 rounded-full" />
  </View>
);

const FeedCardSkeleton: React.FC = () => (
  <View className="px-4 my-4">
    {/* Header */}
    <View className="flex-row items-center">
      <View className="w-10 h-10 rounded-full bg-theme-neutrals-800" />
      <View className="ml-3 flex-1">
        <View className="w-28 h-4 bg-theme-neutrals-800 rounded" />
        <View className="w-20 h-3 bg-theme-neutrals-800 rounded mt-1.5" />
      </View>
    </View>
    {/* Image */}
    <View 
      className="mt-2 bg-theme-neutrals-800 rounded-xl"
      style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH * 0.75 }}
    />
    {/* Caption */}
    <View className="mt-3">
      <View className="w-4/5 h-4 bg-theme-neutrals-800 rounded" />
      <View className="w-2/3 h-3 bg-theme-neutrals-800 rounded mt-2" />
    </View>
    {/* Actions */}
    <View className="flex-row items-center gap-4 mt-3">
      <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
      <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
      <View className="w-12 h-4 bg-theme-neutrals-800 rounded" />
    </View>
  </View>
);

const SearchSkeleton: React.FC = () => {
  return (
    <View className="flex-1">
      {/* Tab bar skeleton */}
      <View className="flex-row px-4 py-2 border-b border-theme-neutrals-800">
        {[0, 1, 2, 3, 4].map((i) => (
          <View 
            key={i} 
            className="px-4 py-2 mr-2 rounded-full bg-theme-neutrals-800"
            style={{ width: i === 0 ? 50 : 70 }}
          />
        ))}
      </View>
      
      {/* Mixed results - accounts and feed cards */}
      <View>
        <AccountCardSkeleton />
        <AccountCardSkeleton />
        <FeedCardSkeleton />
        <AccountCardSkeleton />
        <FeedCardSkeleton />
      </View>
    </View>
  );
};

export default SearchSkeleton;
