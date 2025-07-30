import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const ProfileAssets = () => {
  return (
    <View className="mb-6">
      <Text className="text-lg text-white font-bold mb-2">Assets</Text>
      <View className="flex-row justify-between mb-2">
        <Text className="text-sm text-white">Tokens</Text>
        <Text className="text-sm text-white">0</Text>
      </View>
      <View className="flex-row justify-around">
        {['Top up', 'Bridge (coming soon)', 'Transfer'].map((action) => (
          <TouchableOpacity key={action} className="bg-gray-700 py-2 px-4 rounded">
            <Text className="text-white text-xs">{action}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

export default ProfileAssets;
