import React, { useEffect } from 'react';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { CUT_MORE_PATHS } from '../components/ui/cut-more-paths';
import { KeepDarkScope } from '../libs/jsx/tone';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function Dot({ d, index, progress, reducedMotion, color }: {
  d: string; index: number; progress: SharedValue<number>; reducedMotion: boolean; color: string;
}) {
  const animatedProps = useAnimatedProps(() => {
    // A soft highlight travels across the actual More artwork, left to right.
    const phase = (progress.value - index / 3 + 1) % 1;
    const distance = Math.min(phase, 1 - phase);
    return { opacity: reducedMotion ? 0.7 : 0.24 + 0.66 * Math.max(0, 1 - distance * 6) };
  });
  return <AnimatedPath d={d} fill={color} fillRule="evenodd" animatedProps={animatedProps} />;
}

export default function NavigationLoadingDots({ color = '#FFFFFF' }: { color?: string }) {
  const progress = useSharedValue(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (!reducedMotion) progress.value = withRepeat(withTiming(1, { duration: 1080, easing: Easing.linear }), -1);
    return () => cancelAnimation(progress);
  }, [progress, reducedMotion]);
  return <KeepDarkScope>
    <Svg testID="navigation-loading-dots" width={40} height={40} viewBox="0 0 32 32" accessible={false}>
      {CUT_MORE_PATHS.map((d, index) => <Dot key={d} d={d} index={index} progress={progress} reducedMotion={reducedMotion} color={color} />)}
    </Svg>
  </KeepDarkScope>;
}
