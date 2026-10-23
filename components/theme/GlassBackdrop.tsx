import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';

const ribbons = [
  'M-240 910C160 160 500 1240 920 520S1420-80 1850 180L1810 225C1430-15 1290 920 890 600S210 300-200 960Z',
  'M-150 110C390 750 540-160 1060 240S1490 1080 1810 680L1840 730C1440 1210 1370 630 1010 330S340 860-190 145Z',
  'M160-230C950 120 80 690 760 1000L710 1080C-70 790 820 130 120-170Z',
  'M1130-200C500 240 1710 470 1120 1120L1190 1170C1810 510 680 220 1200-170Z',
];
function LightRibbons({ color }: { color: string }) {
  return <Svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" fill="none">
    <Defs><SvgGradient id="crystalFace" x1="0" y1="0" x2="1" y2="1">
      <Stop stopColor="#efffff" stopOpacity={.02} /><Stop offset=".24" stopColor="#efffff" stopOpacity={.2} /><Stop offset=".28" stopColor="#fff" stopOpacity={.55} /><Stop offset=".31" stopColor={color} stopOpacity={.04} /><Stop offset=".65" stopColor={color} stopOpacity={.16} /><Stop offset=".92" stopColor="#fff" stopOpacity={.3} /><Stop offset="1" stopColor="#fff" stopOpacity={.04} />
    </SvgGradient></Defs>
    {ribbons.map((d, i) => <Path key={i} d={d} fill="url(#crystalFace)" stroke="#eaffff" strokeOpacity={.3} strokeWidth={1.2} />)}
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
    <LinearGradient colors={[tint(.12), 'transparent', tint(.04)]} style={StyleSheet.absoluteFill} />
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
