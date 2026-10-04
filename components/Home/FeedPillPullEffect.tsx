import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { HomePullMotion } from '../../context/HomePullRefreshContext';
import { pillPullVisual } from '../../libs/pill-pull-motion';

export default function FeedPillPullEffect({ motion, refreshing, width }: { motion: HomePullMotion; refreshing: boolean; width: number }) {
  const rimStyle = useAnimatedStyle(() => ({ opacity: pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value).rimOpacity }));
  const clipStyle = useAnimatedStyle(() => ({ height: pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value).gapHeight }));
  const echoStyle = useAnimatedStyle(() => {
    const visual = pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value);
    return { opacity: visual.echoOpacity, transform: [{ translateY: visual.echoOffset }] };
  });
  const right = width - .4;
  const lower = `M .4 28 C .4 36.84 7.56 43.6 16.4 43.6 H ${width - 16.4} C ${width - 7.56} 43.6 ${right} 36.84 ${right} 28`;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="home-pill-pull-effect" style={styles.effect}>
    <Animated.View style={[styles.echoClip, clipStyle]}>
      <Animated.View style={[styles.echo, echoStyle]}>
        <Svg width={width} height={44} viewBox={`0 0 ${width} 44`}>
          <Rect x={.4} y={.4} width={width - .8} height={43.2} rx={16} fill="#DEE8F6" fillOpacity={.045} stroke="#E7EFFA" strokeWidth={.7} />
        </Svg>
      </Animated.View>
    </Animated.View>
    <Animated.View style={[styles.rim, rimStyle]}>
      <Svg width={width + 16} height={60} viewBox={`-8 -8 ${width + 16} 60`}>
        <Defs><LinearGradient id="pull-rim" x1="0" y1="28" x2="0" y2="45" gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor="#EDF5FF" stopOpacity={.12} /><Stop offset=".4" stopColor="#EDF5FF" stopOpacity={.7} /><Stop offset="1" stopColor="#F8FBFF" /></LinearGradient></Defs>
        <Path d={lower} stroke="#E4F0FF" strokeWidth={8} strokeOpacity={.025} fill="none" />
        <Path d={lower} stroke="#E4F0FF" strokeWidth={4} strokeOpacity={.075} fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={2.3} strokeOpacity={.25} fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={.9} strokeOpacity={.87} fill="none" />
      </Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  effect: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  echoClip: { position: 'absolute', top: 44, left: 0, right: 0, overflow: 'hidden' },
  echo: { position: 'absolute', top: -44, left: 0, right: 0 },
  rim: { position: 'absolute', top: -8, left: -8 },
});
