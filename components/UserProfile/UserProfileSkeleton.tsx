import React from 'react';
import { View } from 'react-native';

// Skeleton placeholder matching the current UserProfileHeader layout
const UserProfileSkeleton: React.FC = () => {
  return (
    <View>
      {/* Cover image */}
      <View className="mx-4 rounded-2xl overflow-hidden" style={{ height: 140 }}>
        <View className="w-full h-full bg-theme-neutrals-800 animate-pulse" />
      </View>

      <View className="px-5">
        {/* Avatar + follow button row */}
        <View className="flex-row items-end justify-between" style={{ marginTop: -44 }}>
          <View
            className="bg-theme-neutrals-700 animate-pulse"
            style={{ width: 88, height: 88, borderRadius: 16, borderWidth: 3, borderColor: '#010305' }}
          />
          <View className="h-9 w-24 bg-theme-neutrals-800 rounded-xl mb-1 animate-pulse" />
        </View>

        {/* Name + social icons row */}
        <View className="mt-2 flex-row items-center justify-between">
          <View className="h-6 w-36 bg-theme-neutrals-700 rounded animate-pulse" />
          <View className="flex-row gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <View key={i} className="w-8 h-8 rounded-xl bg-theme-neutrals-800 animate-pulse" />
            ))}
          </View>
        </View>

        {/* @username */}
        <View className="mt-1.5 h-4 w-24 bg-theme-neutrals-800 rounded animate-pulse" />

        {/* Bio */}
        <View className="mt-3 space-y-1.5">
          <View className="h-3.5 w-full bg-theme-neutrals-800 rounded animate-pulse" />
          <View className="h-3.5 w-3/4 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>

        {/* Joined date */}
        <View className="mt-3 h-3.5 w-28 bg-theme-neutrals-800 rounded animate-pulse" />

        {/* Following / Followers */}
        <View className="flex-row items-center gap-4 mt-3">
          <View className="h-4 w-20 bg-theme-neutrals-800 rounded animate-pulse" />
          <View className="h-4 w-20 bg-theme-neutrals-800 rounded animate-pulse" />
        </View>
      </View>
    </View>
  );
};

export default UserProfileSkeleton;
