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
  children: React.ReactNode;
}> = ({ size, radius, className, children }) => {
  const reduced = useReducedMotion();
  const first = useSharedValue(0);
  const second = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    const loop = () => withRepeat(withTiming(1, { duration: DURATION, easing: EASING }), -1, false);
    first.value = loop();
    second.value = withDelay(STAGGER, loop());
    return () => {
      cancelAnimation(first);
      cancelAnimation(second);
      first.value = 0;
      second.value = 0;
    };
  }, [reduced, first, second]);

  const ring = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth: Math.max(1.5, size * 0.05),
    borderColor: LIVE_RED,
  };

  return (
    // No overflow clipping here: the rings grow to 1.6x the avatar.
    <View className={className}>
      {!reduced && <Ring progress={first} style={ring} />}
      {!reduced && <Ring progress={second} style={ring} />}
      {children}
      {/* Reduce motion: one still ring instead of the loop. At the avatar's
          own size it would be hidden behind it, so it goes on the edge. */}
      {reduced && <View pointerEvents="none" style={[styles.ring, ring, { opacity: 0.9 }]} />}
    </View>
  );
};

function Ring({ progress, style }: { progress: SharedValue<number>; style: object }) {
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [0.95, 0]),
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.6]) }],
  }));
  return <Animated.View pointerEvents="none" style={[styles.ring, style, animated]} />;
}

const styles = StyleSheet.create({
  ring: { position: "absolute", top: 0, left: 0 },
});

export default React.memo(LiveRipple);
