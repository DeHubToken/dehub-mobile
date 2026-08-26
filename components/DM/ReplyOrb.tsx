import React, { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * The reply orb — a ball of cosmic dust turning on its own axis, sitting under
 * the suggestion cards.
 *
 * Monochrome by design: white motes over near-black, nothing hued.
 *
 * GEOMETRY IS SHARED WITH WEB. dehubweb's src/components/app/chat/ReplyOrb.tsx
 * is the CSS-keyframe twin of this file — same mote distribution, same
 * durations, same depth curve. Change one, change the other, or the two apps
 * stop looking like the same product.
 *
 * One shared `phase` value drives every mote, and each mote's worklet derives
 * its own position from that plus its fixed starting angle. Web gets the same
 * effect from a single keyframe track plus a negative animation-delay per
 * element. Both stay off their respective JS threads.
 */

/** Enough to read as dust at 44px; every one is an animated view. */
const MOTES = 30;

/**
 * Golden-angle fraction (137.5°/360°). Spacing the starting angles by this
 * scatters the motes instead of banding them into visible stripes, which is
 * what any simple i/N spacing does.
 */
const GOLDEN_FRACTION = 0.381966;

/** ms — mirrored in the web twin. */
const DURATION = {
  idle: { spin: 9000, haze: 3000 },
  thinking: { spin: 2600, haze: 1200 },
} as const;

/** Sphere radius and mote size as fractions of the box. */
const RATIO = { sphere: 0.42, mote: 0.05, haze: 0.62 } as const;

/** The ball leans, so the spin axis reads as 3D rather than a spinning disc. */
const TILT_DEG = -14;

const TAU = Math.PI * 2;

export type ReplyOrbState = "idle" | "thinking";

/**
 * Fixed mote layout. `y` is uniform in [-1, 1] rather than an even sweep of
 * latitude angles — even latitudes crowd the poles, uniform y spreads points
 * evenly over the actual surface.
 */
const LAYOUT = Array.from({ length: MOTES }, (_, i) => {
  const t = (i + 0.5) / MOTES;
  const y = 1 - 2 * t;
  return {
    y,
    ringRadius: Math.sqrt(Math.max(0, 1 - y * y)),
    phase: (i * GOLDEN_FRACTION) % 1,
    // A few brighter, larger grains stop the field reading as uniform noise.
    bright: i % 7 === 3,
  };
});

interface MoteProps {
  spin: SharedValue<number>;
  phase: number;
  ringRadius: number;
  y: number;
  /** Diameter of this grain. */
  size: number;
  /** Sphere radius in px. */
  radius: number;
  /** Container edge, so the grain can centre itself in it. */
  box: number;
  color: string;
}

/**
 * One grain. The hook lives here rather than in a loop in the parent so the
 * number of hooks stays fixed at MOTES — the layout table is a module
 * constant, so React always sees the same call order.
 */
const Mote: React.FC<MoteProps> = ({ spin, phase, ringRadius, y, size, radius, box, color }) => {
  const style = useAnimatedStyle(() => {
    const angle = (spin.value + phase) * TAU;
    // cos gives depth: +1 is the front of the ball, -1 the back.
    const depth = (Math.cos(angle) + 1) / 2;
    return {
      transform: [
        { translateX: ringRadius * radius * Math.sin(angle) },
        { scale: 0.55 + 0.45 * depth },
      ],
      opacity: 0.2 + 0.8 * depth,
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          backgroundColor: color,
          // Latitude is fixed; only the ring sweep is animated.
          left: (box - size) / 2,
          top: (box - size) / 2 + y * radius,
        },
        style,
      ]}
    />
  );
};

interface ReplyOrbProps {
  state?: ReplyOrbState;
  /** Box size. Everything is derived from this. */
  size?: number;
}

const ReplyOrb: React.FC<ReplyOrbProps> = ({ state = "idle", size = 44 }) => {
  const d = DURATION[state];
  const busy = state === "thinking";
  const R = size * RATIO.sphere;
  const moteBase = Math.max(1.5, size * RATIO.mote);
  const hazeSize = size * RATIO.haze;

  const spin = useSharedValue(0);
  const haze = useSharedValue(0);

  useEffect(() => {
    // Restart from zero on a state change so a slow idle cycle can't stall
    // halfway into the fast one.
    spin.value = 0;
    haze.value = 0;
    spin.value = withRepeat(
      withTiming(1, { duration: d.spin, easing: Easing.linear }),
      -1,
      false,
    );
    haze.value = withRepeat(
      withTiming(1, { duration: d.haze / 2, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(spin);
      cancelAnimation(haze);
    };
  }, [d.spin, d.haze, spin, haze]);

  const hazeStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + haze.value * 0.4,
    transform: [{ scale: 1 + haze.value * 0.12 }],
  }));

  const moteColor = busy ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.68)";

  return (
    <View
      style={{ width: size, height: size, transform: [{ rotate: `${TILT_DEG}deg` }] }}
      pointerEvents="none"
    >
      {/* Faint core haze — without it the motes read as a ring of dots rather
          than a body with volume. RN has no radial gradient without pulling in
          a dependency, so this is a soft disc at low alpha; at this size the
          difference from the web twin's gradient is not visible. */}
      <Animated.View
        style={[
          {
            position: "absolute",
            width: hazeSize,
            height: hazeSize,
            borderRadius: hazeSize / 2,
            left: (size - hazeSize) / 2,
            top: (size - hazeSize) / 2,
            backgroundColor: busy ? "rgba(255,255,255,0.13)" : "rgba(255,255,255,0.08)",
          },
          hazeStyle,
        ]}
      />

      {LAYOUT.map((m, i) => (
        <Mote
          key={i}
          spin={spin}
          phase={m.phase}
          ringRadius={m.ringRadius}
          y={m.y}
          size={m.bright ? moteBase * 1.45 : moteBase}
          radius={R}
          box={size}
          color={m.bright ? "rgba(255,255,255,0.95)" : moteColor}
        />
      ))}
    </View>
  );
};

export default React.memo(ReplyOrb);
