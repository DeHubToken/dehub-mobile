import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

export default function NativeWindTest() {
  return (
    <View className="flex-1 bg-white p-4">
      <Text className="text-2xl font-bold text-gray-900 mb-4">
        NativeWind Test
      </Text>
      <TouchableOpacity className="bg-blue-500 p-4 rounded-lg">
        <Text className="text-white text-center font-semibold">
          Tailwind Button
        </Text>
      </TouchableOpacity>
      <View className="mt-4 p-4 bg-gray-100 rounded-lg">
        <Text className="text-gray-700">
          This component uses Tailwind CSS classes with NativeWind!
        </Text>
      </View>
    </View>
  );
}
