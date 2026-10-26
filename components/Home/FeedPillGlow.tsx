import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion,
  useSharedValue, withRepeat, withTiming, type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
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

// No react-native-svg gradients here: on Android they drew the rim's left end
// fully lit (a straight cut) while the right end faded. Horizontal fades use
// native linear gradients; the halo is stacked solid half-ellipses.

/** Web's halo alpha by distance from its centre: radial-gradient stops
 *  .34 at 0, .12 at .45, .03 at .7, 0 at 1. */
function haloAlpha(r: number) {
  if (r <= .45) return .34 + (.12 - .34) * (r / .45);
  if (r <= .7) return .12 + (.03 - .12) * ((r - .45) / .25);
  return .03 * Math.max(0, 1 - r) / .3;
}
// Outer to inner. Each layer adds just enough over the ones beneath it for the
// stack to reach haloAlpha at its own radius.
const HALO_LAYERS = Array.from({ length: 24 }, (_, i) => {
  const r = 1 - i / 24;
  const below = haloAlpha(Math.min(1, r + 1 / 24));
  return { r, o: (haloAlpha(r) - below) / (1 - below) };
}).filter(layer => layer.o > 0);

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
  const { theme, accent, isLight } = useAppTheme();
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
  const { color, gain } = pillGlowColor(theme, accent, isLight);
  const style = useAnimatedStyle(() => ({
    opacity: gain * pillGlowStrength(distance.value, breath.value),
    transform: [{ translateY: pillBottom.value + headerY.value - TOP }],
  }));
  const pill = width - inset * 2;
  if (pill <= 0) return null;
  const [r, g, b] = color;
  // System Light's colour pass flips near-black rgba to white; hsla is left alone.
  const rgba = (a: number) => isLight ? `hsla(240,8%,5%,${a})` : `rgba(${r},${g},${b},${a})`;
  // Light: the shade hangs from the pill's bottom line and only falls downward,
  // so none of it climbs onto the pill.
  const rimTop = isLight ? TOP + 2 : TOP - 1.5;
  const bloom = isLight ? BLOOM.filter(band => band.y > 0).map(band => ({ ...band, y: band.y + 2 })) : BLOOM;
  const centre = width / 2;
  // The bloom spans the rim plus the blur's reach at each end.
  const bloomX = inset + 14 - BLOOM_RAMP / 2;
  const bloomWidth = pill - 28 + BLOOM_RAMP;
  const ramp = BLOOM_RAMP / bloomWidth;
  const haloRx = pill * .92 * .6;
  return (
    <Animated.View
      // Cache the static layer; the pull only changes opacity and translation.
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="home-pill-glow"
      // Full width, so nothing the glow draws can meet the edge of its layer.
      style={[styles.glow, { width }, style]}
    >
      {/* Web: radial-gradient(60% 100% at 50% 0%) over 92% of the pill, its
          flat top on the rim. */}
      <Svg width={width} height={HEIGHT} viewBox={`0 ${-(rimTop + 1.5)} ${width} ${HEIGHT}`} style={StyleSheet.absoluteFill}>
        {HALO_LAYERS.map(layer => {
          const rx = haloRx * layer.r, ry = HALO_HEIGHT * layer.r;
          return <Path key={layer.r} d={`M ${centre - rx} 0 A ${rx} ${ry} 0 0 0 ${centre + rx} 0 Z`} fill={rgba(1)} fillOpacity={layer.o} />;
        })}
      </Svg>
      {bloom.map(band => (
        <LinearGradient
          key={band.y}
          colors={[rgba(0), rgba(.5), rgba(1), rgba(1), rgba(.5), rgba(0)]}
          locations={[0, ramp / 2, ramp, 1 - ramp, 1 - ramp / 2, 1]}
          start={{ x: 0, y: .5 }}
          end={{ x: 1, y: .5 }}
          style={[styles.strip, { left: bloomX, width: bloomWidth, top: TOP + band.y, height: 1, opacity: band.o }]}
        />
      ))}
      <View style={[styles.strip, styles.rim, { left: inset + 14, width: pill - 28, top: rimTop }]}>
        <LinearGradient
          colors={[rgba(0), rgba(1), rgba(1), rgba(0)]}
          locations={[0, .22, .78, 1]}
          start={{ x: 0, y: .5 }}
          end={{ x: 1, y: .5 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Above the header (zIndex 10), whose clip would cut the halo off.
  glow: { position: 'absolute', top: 0, left: 0, height: HEIGHT, zIndex: 11 },
  strip: { position: 'absolute' },
  rim: { height: 1.5, borderRadius: .75, overflow: 'hidden' },
});
