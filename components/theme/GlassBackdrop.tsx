import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';

const ribbons = [
  'M-240 150 C120 -180 250 460 630 190 S1030 -140 1450 210',
  'M-180 650 C120 270 410 990 740 570 S1060 310 1480 620',
  'M-140 1080 C200 720 350 1300 760 990 S1180 740 1480 1120',
  'M100 -240 C480 100 -100 420 300 780 S580 1060 360 1480',
  'M970 -220 C640 130 1270 450 950 790 S620 1180 1090 1490',
];
function LightRibbons({ color }: { color: string }) {
  return <Svg width="100%" height="100%" viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice" fill="none">
    {ribbons.map((d, i) => <G key={i}>
      <Path d={d} stroke={color} strokeWidth={52} opacity={.035} />
      <Path d={d} stroke={color} strokeWidth={24} opacity={.065} />
      <Path d={d} stroke={color} strokeWidth={9} opacity={.14} />
      <Path d={d} stroke={color} strokeWidth={3} opacity={.36} />
    </G>)}
  </Svg>;
}

/** Native vector light ribbons shared by every screen. */
function GlassBackdrop() {
  const { accent, skin } = useAppTheme();
  const progress = useRef(new Animated.Value(0)).current;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { alive = false; sub.remove(); };
  }, []);
  useEffect(() => {
    const makeLoop = () => Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 36000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      Animated.timing(progress, { toValue: 0, duration: 36000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
    ]), { resetBeforeIteration: false });
    let loop: Animated.CompositeAnimation | undefined;
    let running = false;
    const sync = () => {
      const next = !reduced && visualActivity.isVisualActive() && isThemeBackdropVisible() && !isFeedScrolling();
      if (next === running) return;
      running = next;
      if (next) { loop = makeLoop(); loop.start(); }
      else { loop?.stop(); loop = undefined; }
    };
    sync();
    const subscriptions = [visualActivity.subscribe(sync), subscribeThemeBackdrop(sync), subscribeFeedScrollStart(sync), subscribeFeedSettled(sync)];
    return () => { loop?.stop(); subscriptions.forEach(unsubscribe => unsubscribe()); };
  }, [progress, reduced]);
  const tint = (alpha: number) => `rgba(${accent.join(',')},${alpha})`;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: skin?.page ?? '#082a30', overflow: 'hidden' }]}>
    <LinearGradient colors={[tint(.24), 'transparent', tint(.08)]} style={StyleSheet.absoluteFill} />
    <Animated.View style={[styles.light, { transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 32] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 36] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) },
      { scale: 1.1 },
    ] }]}>
      <LightRibbons color={`rgb(${accent.map(c => Math.round(c * .65 + 255 * .35)).join(',')})`} />
    </Animated.View>
    <Animated.View style={[styles.light, { opacity: .4, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [30, -25] }) }, { rotate: '-35deg' }, { scale: 1.4 }] }]}>
      <LightRibbons color={tint(1)} />
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ light: { position: 'absolute', top: '-20%', bottom: '-20%', left: '-20%', right: '-20%' } });
export default memo(GlassBackdrop);
