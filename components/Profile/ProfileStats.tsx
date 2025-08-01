import React from 'react';
import { View, Text } from 'react-native';

const ProfileStats = () => {
  return (
    <View className="flex-row justify-around my-4">
      {['Followers', 'Following', 'Likes', 'Tips earned', 'Tips given'].map((stat) => (
        <View key={stat} className="items-center">
          <Text className="text-lg text-white font-bold">0</Text>
          <Text className="text-xs text-gray-400">{stat}</Text>
        </View>
      ))}
    </View>
  );
};

export default ProfileStats;
