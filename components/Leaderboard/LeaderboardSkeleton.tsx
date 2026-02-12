import React from 'react';
import { View } from 'react-native';

const ROWS = 10;

const LeaderboardSkeleton: React.FC = () => (
  <View className="mt-1">
    {Array.from({ length: ROWS }).map((_, i) => (
      <View key={i} className="flex-row items-center px-4 py-3.5">
        {/* Rank */}
        <View className="w-9 items-center justify-center">
          <View className="w-6 h-6 bg-theme-neutrals-800 rounded-full animate-pulse" />
        </View>
        {/* Avatar + Name */}
        <View className="flex-1 flex-row items-center ml-2">
          <View className="w-10 h-10 bg-theme-neutrals-800 rounded-full mr-3 animate-pulse" />
          <View className="flex-1">
            <View className="h-3.5 w-24 bg-theme-neutrals-800 rounded animate-pulse" />
            <View className="h-3 w-16 bg-theme-neutrals-800 rounded mt-1.5 animate-pulse" />
          </View>
        </View>
        {/* Metric */}
        <View className="h-4 w-20 bg-theme-neutrals-800 rounded ml-2 animate-pulse" />
      </View>
    ))}
  </View>
);

export default React.memo(LeaderboardSkeleton);
