import React from 'react';
import { View } from 'react-native';

// Simple pulse skeleton rows for leaderboard
const ROWS = 8;

const LeaderboardSkeleton: React.FC = () => {
  return (
    <View className="mt-2">
      {Array.from({ length: ROWS }).map((_, i) => (
        <View key={i} className="flex-row items-center py-2 px-2">
          <View className="w-8 h-4 bg-theme-neutrals-800 rounded mr-2 animate-pulse" />
          <View className="flex-row items-center w-32 mr-2">
            <View className="w-6 h-6 bg-theme-neutrals-800 rounded-full mr-2 animate-pulse" />
            <View className="h-4 flex-1 bg-theme-neutrals-800 rounded animate-pulse" />
          </View>
          <View className="w-16 h-4 bg-theme-neutrals-800 rounded mr-2 animate-pulse" />
          <View className="w-16 h-4 bg-theme-neutrals-800 rounded mr-2 animate-pulse" />
          <View className="w-16 h-4 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>
      ))}
    </View>
  );
};

export default LeaderboardSkeleton;
