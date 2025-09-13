import React from 'react';
import { Animated, View, Text } from 'react-native';

type Props = { label: string; opacity: Animated.Value };

const SeekOverlay: React.FC<Props> = ({ label, opacity }) => (
  <Animated.View pointerEvents="none" style={{ opacity }} className="absolute inset-0 items-center justify-center">
    <View className="bg-black/60 px-5 py-3 rounded-full">
      <Text className="text-white font-semibold text-base">{label}</Text>
    </View>
  </Animated.View>
);

export default SeekOverlay;
