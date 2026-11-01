import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Filter, FeGaussianBlur } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';
import { optionalSkia } from '../../libs/skia';
import { isLowEndDevice } from '../../libs/deviceTier';

const LightField = optionalSkia(() => (require('./GlassLightField') as typeof import('./GlassLightField')).default);

const ribbons = [
  'M-220 1220C160 520 550 1050 940 460S1420-160 1850-80',
  'M-200 80C240 100 340 450 820 510S1310 390 1800 650',
  'M-200 1200C400 1100 820 800 1200 660S1600 630 1800 680',
];
function LightRibbons({ color }: { color: string }) {
  return <Svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" fill="none">
    <Defs><SvgGradient id="crystalFace" x1="0" y1="0" x2=".75" y2="1">
      <Stop stopColor={color} stopOpacity={0} /><Stop offset=".18" stopColor={color} stopOpacity={.03} /><Stop offset=".37" stopColor={color} stopOpacity={.14} /><Stop offset=".48" stopColor="#b8f5ff" stopOpacity={.27} /><Stop offset=".53" stopColor="#e2fbff" stopOpacity={.36} /><Stop offset=".57" stopColor={color} stopOpacity={.18} /><Stop offset=".72" stopColor={color} stopOpacity={.05} /><Stop offset="1" stopColor={color} stopOpacity={0} />
    </SvgGradient><Filter id="crystalSoft" x="-50%" y="-50%" width="200%" height="200%"><FeGaussianBlur stdDeviation="14" /></Filter></Defs>
    {ribbons.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={i === 2 ? 72 : 125} strokeOpacity={i === 2 ? .17 : .28} strokeLinecap="round" filter="url(#crystalSoft)" />)}
    {ribbons.slice(0, 2).map((d, i) => <Path key={`crest-${i}`} d={d} stroke="url(#crystalFace)" strokeWidth={46} strokeOpacity={.7} strokeLinecap="round" filter="url(#crystalSoft)" />)}
  </Svg>;
}
// Old and low-memory phones keep the ribbons still (libs/deviceTier).
const LOW_END = isLowEndDevice();
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
      const next = !LOW_END && !reduced && visualActivity.isVisualActive() && isThemeBackdropVisible() && !isFeedScrolling();
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
      {LightField ? <LightField accent={accent} /> : <LightRibbons color={`rgb(${accent.join(',')})`} />}
    </Animated.View>
</View>;
}
const styles = StyleSheet.create({ light: { position: 'absolute', top: '-12%', bottom: '-12%', left: '-12%', right: '-12%' } });
export default memo(GlassBackdrop);
