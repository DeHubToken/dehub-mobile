import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { SeekDirection } from './utils';

interface SeekOverlayProps {
  label: string;
  opacity: SharedValue<number>;
  direction?: SeekDirection;
}

const SeekOverlay: React.FC<SeekOverlayProps> = ({
  label,
  opacity,
  direction,
}) => {
  const isForward = direction === 'forward' || label.startsWith('+');
  const iconName = isForward ? 'play-forward' : 'play-back';

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, animatedStyle]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="bg-black/70 px-6 py-4 rounded-2xl items-center">
        <Ionicons name={iconName} size={32} color="#fff" />
        <Text className="text-white font-bold text-lg mt-1">{label}s</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(SeekOverlay);
