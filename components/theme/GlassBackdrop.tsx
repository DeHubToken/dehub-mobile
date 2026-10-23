import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';

const ribbons = Array.from({ length: 18 }, (_, index) => {
  const vertical = index >= 9;
  const lane = index % 9;
  const points = Array.from({ length: 10 }, (_, step) => {
    const along = step * 200 - 300;
    const across = lane * 170 - 120 + Math.sin(step * 1.37 + lane * 1.8) * 100 + Math.cos(step * .71 - lane) * 60;
    return vertical ? [across, along] : [along, across];
  });
  let d = `M${points[0].join(' ')}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], e = points[Math.min(points.length - 1, i + 2)];
    d += ` C${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6} ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6} ${c.join(' ')}`;
  }
  return d;
});
function LightRibbons({ color }: { color: string }) {
  return <Svg width="100%" height="100%" viewBox="0 0 1200 1200" preserveAspectRatio="xMidYMid slice" fill="none">
    {ribbons.map((d, i) => <G key={i}>
      <Path d={d} stroke={color} strokeWidth={80} opacity={.045} />
      <Path d={d} stroke={color} strokeWidth={38} opacity={.09} />
      <Path d={d} stroke={color} strokeWidth={16} opacity={.2} />
      <Path d={d} stroke={color} strokeWidth={5} opacity={.5} />
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
    <LinearGradient colors={[tint(.36), 'transparent', tint(.16)]} style={StyleSheet.absoluteFill} />
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
const styles = StyleSheet.create({ light: { position: 'absolute', top: '-12%', bottom: '-12%', left: '-12%', right: '-12%' } });
export default memo(GlassBackdrop);
