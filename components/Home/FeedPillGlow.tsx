import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAppTheme } from '../../context/ThemeContext';
import { useFeedPillRefreshing } from '../../libs/feed-pill-refresh';
import { pillGlowColor, pillGlowStrength } from '../../libs/pill-glow';
import { PULL_GLOW_FADE_MS } from '../../libs/pill-pull-motion';

const HALO_HEIGHT = 34;
// Room above the rim for its bloom to spread over the pill's bottom edge.
const TOP = 10;
const HEIGHT = TOP + HALO_HEIGHT;
// Web lights the rim with `box-shadow: 0 1px 8px`. Android has no blur, so the
// bloom is thin full-length strips whose opacity follows that shadow's
// Gaussian falloff (sigma 4, 1pt below the rim).
const BLOOM = Array.from({ length: 19 }, (_, i) => {
  const y = i - 9;
  return { y: y - .5, o: .7 * .15 * Math.exp(-((y - .25) ** 2) / 32) };
});
// The blur also softens the rim's ends: the bloom ramps in over 16pt.
const BLOOM_RAMP = 16;

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
    transform: [{ translateY: pillBottom.value + headerY.value - TOP }],
  }));
  const pill = width - inset * 2;
  if (pill <= 0) return null;
  const rgb = `rgb(${color[0]},${color[1]},${color[2]})`;
  const centre = width / 2;
  // The bloom spans the rim plus the blur's reach at each end.
  const bloomX = inset + 14 - BLOOM_RAMP / 2;
  const bloomWidth = pill - 28 + BLOOM_RAMP;
  const ramp = BLOOM_RAMP / bloomWidth;
  const haloRx = pill * .92 * .6;
  return (
    <Animated.View
      // Cache the static SVG; the pull only changes opacity and translation.
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="home-pill-glow"
      // Full width, so nothing the glow draws can meet the edge of its layer.
      style={[styles.glow, { width }, style]}
    >
      <Svg width={width} height={HEIGHT} viewBox={`0 ${-TOP} ${width} ${HEIGHT}`}>
        <Defs>
          {/* Web: radial-gradient(60% 100% at 50% 0%) over 92% of the pill.
              The half ellipse ends where the gradient reaches 0, so it has
              no edge; its flat top sits on the rim. */}
          <RadialGradient id="pill-glow-halo" cx="50%" cy="0%" rx="50%" ry="100%">
            <Stop offset="0" stopColor={rgb} stopOpacity={.34} />
            <Stop offset=".45" stopColor={rgb} stopOpacity={.12} />
            <Stop offset=".7" stopColor={rgb} stopOpacity={.03} />
            <Stop offset="1" stopColor={rgb} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="pill-glow-rim" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={rgb} stopOpacity={0} />
            <Stop offset=".22" stopColor={rgb} />
            <Stop offset=".78" stopColor={rgb} />
            <Stop offset="1" stopColor={rgb} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="pill-glow-bloom" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={rgb} stopOpacity={0} />
            <Stop offset={ramp / 2} stopColor={rgb} stopOpacity={.5} />
            <Stop offset={ramp} stopColor={rgb} />
            <Stop offset={1 - ramp} stopColor={rgb} />
            <Stop offset={1 - ramp / 2} stopColor={rgb} stopOpacity={.5} />
            <Stop offset="1" stopColor={rgb} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Each gradient shape starts at x = 0 inside a translated group. On
            Android a bounding-box gradient on a shape offset from the origin
            showed its left end part-lit (a straight cut) while the right end
            faded; with no offset there is nothing to misplace. */}
        <G transform={`translate(${centre - haloRx} 0)`}>
          <Path d={`M 0 0 A ${haloRx} ${HALO_HEIGHT} 0 0 0 ${haloRx * 2} 0 Z`} fill="url(#pill-glow-halo)" />
        </G>
        <G transform={`translate(${bloomX} 0)`}>
          {BLOOM.map(band => (
            <Rect key={band.y} x={0} y={band.y} width={bloomWidth} height={1} fill="url(#pill-glow-bloom)" fillOpacity={band.o} />
          ))}
        </G>
        <G transform={`translate(${inset + 14} 0)`}>
          <Rect x={0} y={-1.5} width={pill - 28} height={1.5} rx={.75} fill="url(#pill-glow-rim)" />
        </G>
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the header (zIndex 10), whose clip would cut the halo off.
  glow: { position: 'absolute', top: 0, left: 0, height: HEIGHT, zIndex: 11 },
});
