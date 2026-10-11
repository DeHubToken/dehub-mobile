import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { useFeedPillRefreshing } from '../../libs/feed-pill-refresh';
import { pillGlowColor, pillGlowStrength } from '../../libs/pill-glow';
import { PULL_GLOW_FADE_MS } from '../../libs/pill-pull-motion';

const HALO_HEIGHT = 34;
// A soft shadow under the rim, built from stacked low-opacity bands because
// Android has no blur.
const RIM_BLOOM = [{ h: 3, o: .35 }, { h: 6, o: .16 }, { h: 10, o: .07 }];

/** Soft light under the feed tab pill while the feed is pulled or refreshing.
 *  Brightens with the pull, then breathes until the new posts land. The
 *  immersive capsule draws its own version (FeedPillPullEffect). */
export default function FeedPillGlow({ distance, pillBottom, headerY, width, inset }: {
  distance: SharedValue<number>;
  /** The pill's bottom edge inside the header, and the header's slide. */
  pillBottom: SharedValue<number>;
  headerY: SharedValue<number>;
  width: number;
  inset: number;
}) {
  const { theme, accent } = useAppTheme();
  const refreshing = useFeedPillRefreshing();
  const reduced = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(breath);
    if (!refreshing) {
      breath.value = withTiming(0, { duration: PULL_GLOW_FADE_MS, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System });
      return;
    }
    if (reduced) { breath.value = .32; return; }
    breath.value = .3;
    breath.value = withRepeat(withTiming(.45, { duration: 1800, easing: Easing.inOut(Easing.sin), reduceMotion: ReduceMotion.Never }), -1, true);
    return () => cancelAnimation(breath);
  }, [breath, reduced, refreshing]);
  const { color, gain } = pillGlowColor(theme, accent);
  const style = useAnimatedStyle(() => ({
    opacity: gain * pillGlowStrength(distance.value, breath.value),
    transform: [{ translateY: pillBottom.value + headerY.value - 1.5 }],
  }));
  const pill = width - inset * 2;
  if (pill <= 0) return null;
  const rgb = `rgb(${color[0]},${color[1]},${color[2]})`;
  return (
    <Animated.View
      // Cache the static SVG; the pull only changes opacity and translation.
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="home-pill-glow"
      style={[styles.glow, { left: inset, width: pill }, style]}
    >
      <Svg width={pill} height={HALO_HEIGHT + 1.5} viewBox={`0 -1.5 ${pill} ${HALO_HEIGHT + 1.5}`}>
        <Defs>
          <RadialGradient id="pill-glow-halo" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={rgb} stopOpacity={.42} />
            <Stop offset=".5" stopColor={rgb} stopOpacity={.12} />
            <Stop offset=".78" stopColor={rgb} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="pill-glow-rim" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={rgb} stopOpacity={0} />
            <Stop offset=".22" stopColor={rgb} />
            <Stop offset=".78" stopColor={rgb} />
            <Stop offset="1" stopColor={rgb} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Ellipse cx={pill / 2} cy={0} rx={pill * .55} ry={HALO_HEIGHT} fill="url(#pill-glow-halo)" />
        {RIM_BLOOM.map(band => (
          <Rect key={band.h} x={14} y={0} width={pill - 28} height={band.h} rx={band.h / 2} fill="url(#pill-glow-rim)" fillOpacity={band.o} />
        ))}
        <Rect x={14} y={-1.5} width={pill - 28} height={1.5} rx={.75} fill="url(#pill-glow-rim)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the header (zIndex 10), whose clip would cut the halo off.
  glow: { position: 'absolute', top: 0, height: HALO_HEIGHT + 1.5, zIndex: 11 },
});
