import React, { memo, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../context/ThemeContext';
import { visualActivity } from '../../libs/visualActivity';
import { isThemeBackdropVisible, subscribeThemeBackdrop } from '../../libs/themeBackdrop';
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from '../../libs/scrollActivity';

/** Native composited light, shared by every screen without a WebView or shader. */
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
    ] }]}>
      <LinearGradient colors={['transparent', tint(.16), 'rgba(210,255,250,.1)', 'transparent']} locations={[0, .3, .5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
    <Animated.View style={[styles.light, { opacity: .6, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [30, -25] }) }, { rotate: '-35deg' }] }]}>
      <LinearGradient colors={['transparent', tint(.24), 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: .7 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ light: { position: 'absolute', top: '-20%', bottom: '-20%', left: '-20%', right: '-20%' } });
export default memo(GlassBackdrop);
