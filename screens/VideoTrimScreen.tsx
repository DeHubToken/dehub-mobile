import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { ScreenNames } from '../navigation/ScreenNames';

export default function VideoTrimScreen() {
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const asset = route.params?.asset;

  const onContinue = useCallback(() => {
    nav.navigate(ScreenNames.VideoUpload as never, { asset } as never);
  }, [nav, asset]);

  return (
    <View className="flex-1 bg-black p-4">
      <Text className="text-white mb-3 font-bold text-lg">Trim Video</Text>
      {/* TODO: integrate a proper trimmer component */}
      <View className="flex-1 rounded-xl bg-gray-900" />
      <TouchableOpacity onPress={onContinue} className="mt-4 h-12 rounded-xl bg-violet-600 items-center justify-center">
        <Text className="text-white font-bold">Continue</Text>
      </TouchableOpacity>
    </View>
  );
}
