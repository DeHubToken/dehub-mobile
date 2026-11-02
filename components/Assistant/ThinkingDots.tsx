import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { isLowEndDevice } from '../../libs/deviceTier';

const DOT = { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4D4D8' } as const;

function Dot({ delay, still }: { delay: number; still: boolean }) {
  const lift = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    lift.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 320 }), withTiming(0, { duration: 320 })), -1));
    return () => cancelAnimation(lift);
  }, [delay, still, lift]);
  const style = useAnimatedStyle(() => ({ opacity: 0.4 + lift.value * 0.6, transform: [{ translateY: -3 * lift.value }] }));
  return <Animated.View style={[DOT, still ? { opacity: 0.7 } : style]} />;
}

/** Three soft dots while the assistant thinks. Still on low-end Android. */
export default function ThinkingDots() {
  const still = isLowEndDevice();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 14 }} accessibilityElementsHidden>
      <Dot delay={0} still={still} />
      <Dot delay={140} still={still} />
      <Dot delay={280} still={still} />
    </View>
  );
}
