import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';

const ribbons = [
  'M-260 1270C160 500 550 1100 920 430S1420-180 1850-160L1850 130C1390 30 1280 380 1030 700S210 650-100 1360Z',
  'M-220 520C300 1100 690 570 1010 240S1480-100 1840 110L1850 330C1430 30 1260 200 1080 430S370 1320-260 710Z',
  'M260-180C660 200 560 360 1020 350S1360 650 1770 620L1780 770C1240 750 1300 430 960 470S540 360 180-120Z',
];
function LightRibbons({ color }: { color: string }) {
  return <Svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" fill="none">
    <Defs><SvgGradient id="crystalFace" x1="0" y1="0" x2=".75" y2="1">
      <Stop stopColor={color} stopOpacity={0} /><Stop offset=".18" stopColor={color} stopOpacity={.03} /><Stop offset=".37" stopColor={color} stopOpacity={.14} /><Stop offset=".48" stopColor="#b8f5ff" stopOpacity={.27} /><Stop offset=".53" stopColor="#e2fbff" stopOpacity={.36} /><Stop offset=".57" stopColor={color} stopOpacity={.18} /><Stop offset=".72" stopColor={color} stopOpacity={.05} /><Stop offset="1" stopColor={color} stopOpacity={0} />
    </SvgGradient></Defs>
    {ribbons.map((d, i) => <Path key={i} d={d} fill="url(#crystalFace)" opacity={i === 2 ? .45 : 1} />)}
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
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: skin?.page ?? '#06151b', overflow: 'hidden' }]}>
    <LinearGradient colors={[tint(.28), 'transparent', tint(.09)]} start={{ x: 1, y: 0 }} end={{ x: .1, y: 1 }} style={StyleSheet.absoluteFill} />
    <Animated.View style={[styles.light, { transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 32] }) },
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-16, 36] }) },
      { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['-3deg', '3deg'] }) },
      { scale: 1.1 },
    ] }]}>
      <LightRibbons color={`rgb(${accent.map(c => Math.round(c * .65 + 255 * .35)).join(',')})`} />
    </Animated.View>
</View>;
}
const styles = StyleSheet.create({ light: { position: 'absolute', top: '-12%', bottom: '-12%', left: '-12%', right: '-12%' } });
export default memo(GlassBackdrop);
