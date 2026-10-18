import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** The red every LIVE badge and dot in the app uses. */
export const LIVE_RED = "#EF4444";

const DURATION = 2200;
const STAGGER = 1100;
const EASING = Easing.bezier(0.2, 0.6, 0.3, 1);

/**
 * The feed ripple, sized for a 40pt avatar. A profile avatar is twice that
 * and more, so there the same motion (4pt rings out to 1.6x) looked wild:
 * `quiet` is one thin, faint ring that drifts a few points out, slower.
 */
const LOUD = { rings: 2, duration: DURATION, from: 0.95, scale: 1.6 };
const QUIET = { rings: 1, duration: 3200, from: 0.55, scale: 1.1 };

/**
 * Two outlines of the avatar's own shape drifting outward and fading, like a
 * signal going out, for someone who is live right now. Wraps the avatar box.
 *
 * The rings sit behind the avatar at its size and radius, so nothing is drawn
 * over the face: each one only shows once it has grown past the edge. Plain
 * Views on Reanimated shared values -- the loop runs on the UI thread with no
 * JS timers, and nothing native beyond what the app already ships.
 */
const LiveRipple: React.FC<{
  size: number;
  radius: number;
  className?: string;
  /** Profile pages: one faint thin ring instead of the feed's two. */
  quiet?: boolean;
  children: React.ReactNode;
}> = ({ size, radius, className, quiet = false, children }) => {
  const reduced = useReducedMotion();
  const tone = quiet ? QUIET : LOUD;
  const first = useSharedValue(0);
  const second = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const easing = quiet ? Easing.out(Easing.quad) : EASING;
    const loop = () => withRepeat(withTiming(1, { duration: tone.duration, easing }), -1, false);
    first.value = loop();
    if (tone.rings > 1) second.value = withDelay(STAGGER, loop());
    return () => {
      cancelAnimation(first);
      cancelAnimation(second);
      first.value = 0;
      second.value = 0;
    };
  }, [reduced, first, second, quiet, tone.duration, tone.rings]);

  const ring = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth: quiet ? 1.5 : Math.max(1.5, size * 0.05),
    borderColor: LIVE_RED,
  };

  return (
    // No overflow clipping here: the rings grow to 1.6x the avatar.
    <View className={className}>
      {!reduced && <Ring progress={first} style={ring} from={tone.from} scale={tone.scale} />}
      {!reduced && tone.rings > 1 && <Ring progress={second} style={ring} from={tone.from} scale={tone.scale} />}
      {children}
      {/* Reduce motion: one still ring instead of the loop. At the avatar's
          own size it would be hidden behind it, so it goes on the edge. */}
      {reduced && (
        <View
          pointerEvents="none"
          style={[styles.ring, ring, { opacity: quiet ? 0.6 : 0.9, transform: [{ scale: quiet ? 1.04 : 1.12 }] }]}
        />
      )}
    </View>
  );
};

function Ring({
  progress,
  style,
  from,
  scale,
}: {
  progress: SharedValue<number>;
  style: object;
  from: number;
  scale: number;
}) {
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [from, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, scale]) }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style, animated]} />;
}

const styles = StyleSheet.create({
  ring: { position: "absolute", top: 0, left: 0 },
});

export default React.memo(LiveRipple);
