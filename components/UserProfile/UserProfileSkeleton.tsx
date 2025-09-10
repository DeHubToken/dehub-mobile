import React from 'react';
import { View } from 'react-native';

// Simple skeleton placeholders using tailwind utility classes
const UserProfileSkeleton: React.FC = () => {
  return (
    <View className="px-4 py-4">
      <View className="w-full h-24 bg-theme-neutrals-800 rounded-lg mb-[-36px]" />
      <View className="flex-row items-end mt-[-36px]">
        <View className="w-24 h-24 rounded-full bg-theme-neutrals-700 border-[8px] border-theme-neutrals-900" />
        <View className="ml-4 flex-1">
          <View className="h-6 w-32 bg-theme-neutrals-700 rounded mb-2" />
          <View className="h-4 w-20 bg-theme-neutrals-800 rounded" />
        </View>
      </View>
      <View className="mt-6 flex-row justify-around">
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} className="items-center">
            <View className="h-5 w-10 bg-theme-neutrals-700 rounded mb-2" />
            <View className="h-3 w-12 bg-theme-neutrals-800 rounded" />
          </View>
        ))}
      </View>
      <View className="mt-6 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} className="h-4 w-full bg-theme-neutrals-800 rounded" />
        ))}
      </View>
    </View>
  );
};

export default UserProfileSkeleton;
