import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { HomePullMotion } from '../../context/HomePullRefreshContext';
import { pillPullVisual } from '../../libs/pill-pull-motion';

// Feather the Android rim in small, low-opacity steps rather than four hard
// bands. This also works on older APKs without adding a native blur module.
const ANDROID_GLOW = Array.from({ length: 20 }, (_, i) => {
  const radius = 20 - i;
  const alpha = .055 * Math.exp(-(radius * radius) / 72);
  const previous = radius === 20 ? 0 : .055 * Math.exp(-((radius + 1) ** 2) / 72);
  return { width: radius * 2, opacity: (alpha - previous) / (1 - previous) };
});

export default function FeedPillPullEffect({ motion, refreshing, width }: { motion: HomePullMotion; refreshing: boolean; width: number }) {
  const rimStyle = useAnimatedStyle(() => ({ opacity: pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value).rimOpacity }));
  const clipStyle = useAnimatedStyle(() => ({ height: pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value).gapHeight }));
  const echoStyle = useAnimatedStyle(() => {
    const visual = pillPullVisual(motion.distance.value, motion.pulling.value, refreshing, motion.flow.value);
    return { opacity: visual.echoOpacity, transform: [{ translateY: visual.echoOffset }] };
  });
  const android = Platform.OS === 'android';
  const right = width - .4;
  const lower = `M .4 28 C .4 36.84 7.56 43.6 16.4 43.6 H ${width - 16.4} C ${width - 7.56} 43.6 ${right} 36.84 ${right} 28`;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="home-pill-pull-effect" style={[styles.effect, android && styles.androidEffect]}>
    <Animated.View style={[styles.echoClip, clipStyle]}>
      <Animated.View style={[styles.echo, echoStyle]}>
        <Svg width={width} height={44} viewBox={`0 0 ${width} 44`}>
          <Rect x={.4} y={.4} width={width - .8} height={43.2} rx={16} fill="#DEE8F6" fillOpacity={.045} stroke="#E7EFFA" strokeWidth={.7} />
        </Svg>
      </Animated.View>
    </Animated.View>
    <Animated.View style={[styles.rim, android && { top: -24, left: -48, width: width + 96, height: 116 }, rimStyle]}>
      <Svg width={width + (android ? 96 : 48)} height={android ? 116 : 92} viewBox={android ? `-48 -24 ${width + 96} 116` : `-24 -12 ${width + 48} 92`}>
        <Defs>
          <LinearGradient id="pull-rim" x1="0" y1="28" x2="0" y2="45" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#EDF5FF" stopOpacity={0} />
            <Stop offset=".28" stopColor="#EDF5FF" stopOpacity={.22} />
            <Stop offset=".62" stopColor="#EDF5FF" stopOpacity={.7} />
            <Stop offset="1" stopColor="#F8FBFF" />
          </LinearGradient>
          <RadialGradient id="pull-halo" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#E4F0FF" stopOpacity={.065} />
            <Stop offset=".4" stopColor="#E4F0FF" stopOpacity={.03} />
            <Stop offset=".75" stopColor="#E4F0FF" stopOpacity={.008} />
            <Stop offset="1" stopColor="#E4F0FF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={43.6} rx={width / 2 + 12} ry={24} fill="url(#pull-halo)" />
        {android ? ANDROID_GLOW.map(layer => (
          <Path key={layer.width} d={lower} stroke="url(#pull-rim)" strokeWidth={layer.width} strokeOpacity={layer.opacity} strokeLinecap="round" fill="none" />
        )) : <>
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={24} strokeOpacity={.006} strokeLinecap="round" fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={16} strokeOpacity={.014} strokeLinecap="round" fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={10} strokeOpacity={.035} strokeLinecap="round" fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={6} strokeOpacity={.075} strokeLinecap="round" fill="none" />
        </>}
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={2.3} strokeOpacity={.22} strokeLinecap="round" fill="none" />
        <Path d={lower} stroke="url(#pull-rim)" strokeWidth={.8} strokeOpacity={.62} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  effect: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5 },
  // Real bounds prevent Android opacity compositing at the pill's bottom edge.
  androidEffect: { height: 224, overflow: 'visible' },
  echoClip: { position: 'absolute', top: 44, left: 0, right: 0, overflow: 'hidden' },
  echo: { position: 'absolute', top: -44, left: 0, right: 0 },
  rim: { position: 'absolute', top: -12, left: -24 },
});
