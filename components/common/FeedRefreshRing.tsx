import React, { useEffect } from 'react';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedProps, useAnimatedStyle,
  useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { PULL_REFRESH_THRESHOLD } from '../../libs/pill-pull-motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const CIRCUMFERENCE = 2 * Math.PI * 16;

export default function FeedRefreshRing({ refreshing, distance, color }: {
  refreshing: boolean;
  distance?: SharedValue<number>;
  color: string;
}) {
  const rotation = useSharedValue(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = 0;
    if (refreshing && !reduced) {
      rotation.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear, reduceMotion: ReduceMotion.System }), -1);
    }
    return () => cancelAnimation(rotation);
  }, [refreshing, reduced, rotation]);
  const style = useAnimatedStyle(() => ({
    opacity: refreshing || (distance?.value ?? 0) > 0 ? 1 : 0,
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - (refreshing ? .72 : Math.max(0, Math.min(1, (distance?.value ?? 0) / PULL_REFRESH_THRESHOLD)))),
  }));
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="feed-logo-refresh-ring"
      style={[{ position: 'absolute', width: 36, height: 36, left: '50%', top: '50%', marginLeft: -18, marginTop: -18 }, style]}>
      <Svg width={36} height={36} viewBox="0 0 36 36">
        <Circle cx={18} cy={18} r={16} fill="none" stroke={color} strokeOpacity={.2} strokeWidth={1.5} />
        <AnimatedCircle cx={18} cy={18} r={16} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round"
          strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]} animatedProps={arc} rotation={-90} origin="18,18" />
      </Svg>
    </Animated.View>
  );
}
