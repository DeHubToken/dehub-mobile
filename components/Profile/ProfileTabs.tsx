import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const ProfileTabs = () => {
  return (
    <View className="flex-row justify-around">
      {['Videos', 'Feed', 'Activity', 'Livestreams'].map((tab) => (
        <TouchableOpacity key={tab} className="py-2 px-4">
          <Text className="text-white text-sm">{tab}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

export default ProfileTabs;
