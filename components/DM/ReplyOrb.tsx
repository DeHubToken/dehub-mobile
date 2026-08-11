import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * The reply orb — the AI affordance under the suggestion cards.
 *
 * Monochrome by design: a white core over stacked white-alpha haloes, nothing
 * hued, so it sits on whatever surface the screen paints.
 *
 * GEOMETRY IS SHARED WITH WEB. dehubweb's src/components/app/chat/ReplyOrb.tsx
 * is the CSS-keyframe twin of this file — same ratios, same durations, same
 * scale endpoints. Change one, change the other, or the two apps stop looking
 * like the same product.
 *
 * Every layer animates transform and opacity only, so the whole thing runs on
 * the UI thread and survives a busy JS thread (which, on the chat screen mid
 * send, is the normal case).
 */

const RATIO = {
  halo3: 1,
  halo2: 0.77,
  halo1: 0.59,
  sonar: 0.5,
  core: 0.41,
  dot: 0.068,
  orbit: 0.34,
} as const;

/** ms — mirrored in the web twin. */
const DURATION = {
  idle: { breathe: 2600, sonar: 3400, orbit: 6000 },
  thinking: { breathe: 900, sonar: 1600, orbit: 1400 },
} as const;

export type ReplyOrbState = "idle" | "thinking";

interface ReplyOrbProps {
  state?: ReplyOrbState;
  /** Box size. Every layer is derived from this. */
  size?: number;
}

const ReplyOrb: React.FC<ReplyOrbProps> = ({ state = "idle", size = 44 }) => {
  const d = DURATION[state];
  const busy = state === "thinking";

  // One 0→1 driver per effect. Deriving scale/opacity by interpolation is what
  // keeps this a literal port of the CSS keyframes rather than an approximation.
  const breathe = useSharedValue(0);
  const sonarA = useSharedValue(0);
  const sonarB = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    // Restart from zero on a state change so a slow idle cycle can't stall
    // halfway into the fast one.
    breathe.value = 0;
    sonarA.value = 0;
    sonarB.value = 0;
    orbit.value = 0;

    breathe.value = withRepeat(
      withTiming(1, { duration: d.breathe / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    sonarA.value = withRepeat(
      withTiming(1, { duration: d.sonar, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
    // Half a period behind, so one ring is always mid-flight. CSS gets this
    // with a negative animation-delay; here the offset lands after the first
    // half-cycle, which is invisible on a loop this short.
    sonarB.value = withDelay(
      d.sonar / 2,
      withRepeat(
        withTiming(1, { duration: d.sonar, easing: Easing.out(Easing.ease) }),
        -1,
        false,
      ),
    );
    orbit.value = withRepeat(
      withTiming(1, { duration: d.orbit, easing: Easing.linear }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(breathe);
      cancelAnimation(sonarA);
      cancelAnimation(sonarB);
      cancelAnimation(orbit);
    };
  }, [d.breathe, d.sonar, d.orbit, breathe, sonarA, sonarB, orbit]);

  const px = (r: number) => Math.round(size * r);

  /** Absolutely-centred circle of a given diameter. */
  const layer = (ratio: number) => {
    const dim = px(ratio);
    return {
      position: "absolute" as const,
      width: dim,
      height: dim,
      left: (size - dim) / 2,
      top: (size - dim) / 2,
      borderRadius: dim / 2,
    };
  };

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(breathe.value, [0, 1], [1, 1.08]) }],
  }));

  // 0% scale .85 / opacity .55 → 70% opacity 0 → 100% scale 2.2. Same curve as
  // the `orb-sonar` keyframe. Written out twice rather than through a helper:
  // a factory that calls useAnimatedStyle is a rules-of-hooks violation even
  // when the call count happens to be stable.
  const sonarAStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sonarA.value, [0, 0.7, 1], [0.55, 0, 0]),
    transform: [{ scale: interpolate(sonarA.value, [0, 1], [0.85, 2.2]) }],
  }));
  const sonarBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sonarB.value, [0, 0.7, 1], [0.55, 0, 0]),
    transform: [{ scale: interpolate(sonarB.value, [0, 1], [0.85, 2.2]) }],
  }));

  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(orbit.value, [0, 1], [0, 360])}deg` }],
  }));

  const orbitBox = px(RATIO.orbit * 2);
  // At the 22px toolbar size the ratio rounds the speck down to 1px, which
  // renders as a smudge on a 3x screen. Two is the smallest it reads at.
  const dot = Math.max(2, px(RATIO.dot));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* Three stacked washes instead of a blur: RN has no cheap blur, and at
          this size the banding is invisible. */}
      <View style={[layer(RATIO.halo3), { backgroundColor: "rgba(255,255,255,0.05)" }]} />
      <View style={[layer(RATIO.halo2), { backgroundColor: "rgba(255,255,255,0.08)" }]} />
      <View style={[layer(RATIO.halo1), { backgroundColor: "rgba(255,255,255,0.14)" }]} />

      <Animated.View
        style={[
          layer(RATIO.sonar),
          { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
          sonarAStyle,
        ]}
      />
      <Animated.View
        style={[
          layer(RATIO.sonar),
          { borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
          sonarBStyle,
        ]}
      />

      {/* Orbiting speck: a rotator box with the dot pinned to its top edge, so
          one rotate transform does all the work. */}
      <Animated.View style={[layer(RATIO.orbit * 2), orbitStyle]}>
        <View
          style={{
            position: "absolute",
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            left: (orbitBox - dot) / 2,
            top: -dot / 2,
            backgroundColor: busy ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.6)",
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          layer(RATIO.core),
          {
            backgroundColor: busy ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.88)",
            // RN shadows are per-platform; elevation gives Android the same
            // lift that shadowRadius gives iOS.
            shadowColor: "#FFFFFF",
            shadowOpacity: busy ? 0.45 : 0.22,
            shadowRadius: busy ? 7 : 4,
            shadowOffset: { width: 0, height: 0 },
            elevation: busy ? 6 : 3,
          },
          breatheStyle,
        ]}
      />
    </View>
  );
};

export default React.memo(ReplyOrb);
