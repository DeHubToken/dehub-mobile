import React, { memo } from 'react';
import { View } from 'react-native';

const AccountSkeletonComponent: React.FC = () => (
  <View className="px-4 py-3 border-b border-theme-neutrals-800 flex-row items-center">
    {/* Matches Avatar's own radius (size * 0.16) at 40px, so the skeleton does
        not draw a circle where the real account row draws a rounded square. */}
    <View className="w-10 h-10 rounded-md bg-theme-neutrals-700 animate-pulse" />
    <View className="flex-1 ml-3">
      <View className="h-3 w-1/2 bg-theme-neutrals-700 rounded mb-2 animate-pulse" />
      <View className="h-3 w-1/3 bg-theme-neutrals-800 rounded animate-pulse" />
    </View>
  </View>
);

const AccountSkeleton = memo(AccountSkeletonComponent);
export default AccountSkeleton;