import React, { useEffect, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

/**
 * The volume bar, drawn by hand so it can be as thick as the colour bar beside
 * it (the native slider on top keeps its thumb, touch and the Android/iOS hold
 * effects, with its own tracks made transparent). While sound is coming out,
 * faint notes flow through the fill toward the handle and a thin arc slides out
 * of the handle on each beat. Still when paused, muted or with reduced motion.
 *
 * Same numbers as web (dehubweb src/components/app/audio/VolumeSoundCue.tsx).
 * Plain Views on Reanimated shared values, nothing native the app lacks.
 */
const BPM = 112;
const ECHO_LIFE = 1.15;
const CLOCK_SPAN = 3600;
const INK = "#0a141a";
const ECHO_INK = "#f0f8fa";
// ♪ and ♫ on a 12px box.
const NOTE_PATHS = [
  ["M1 9.4a2.6 2 0 1 0 5.2 0a2.6 2 0 1 0-5.2 0z", "M5.4 1h1v8.4h-1z", "M6.4 1c1.6.8 3.2 2 2.8 4.8c-.4-1.4-1.4-2.2-2.8-2.4z"],
  ["M.6 9.8a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0z", "M6.6 8.6a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0-4.4 0z", "M4.2 2.4h.8v7.4h-.8z", "M10.2 1.2h.8v7.4h-.8z", "M4.2 2.4L11 1.2V3L4.2 4.2z"],
];
const NOTE_SLOTS = 4;

interface VolumeTrackProps {
  /** 0..1, the slider's value. */
  value: number;
  /** Sound is actually coming out: playing and not muted. */
  active: boolean;
  fillColor: string;
  trackColor: string;
  /** Matches the colour bar: 10pt thick, 10pt in from each side. */
  height?: number;
  inset?: number;
}

export const VolumeTrack: React.FC<VolumeTrackProps> = ({ value, active, fillColor, trackColor, height = 10, inset = 10 }) => {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const clock = useSharedValue(0);
  const fade = useSharedValue(0);
  const level = useSharedValue(value);
  const span = useSharedValue(0);
  const on = active && !reduced && width > 0;

  useEffect(() => { level.value = value; }, [level, value]);
  useEffect(() => { span.value = Math.max(0, width - inset * 2); }, [span, width, inset]);
  useEffect(() => {
    fade.value = withTiming(on ? 1 : 0, { duration: on ? 300 : 450 });
    if (!on) return;
    clock.value = withRepeat(withTiming(clock.value + CLOCK_SPAN, { duration: CLOCK_SPAN * 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(clock);
  }, [on, clock, fade]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const shown = Math.max(0, Math.min(1, value));
  const radius = height / 2;
  // The native thumb is about 20pt wide and travels from `inset` to width - `inset`.
  const thumbRadius = inset;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      <View style={[styles.bar, { left: inset, right: inset, height, marginTop: -radius, borderRadius: radius, backgroundColor: trackColor }]} />
      <View style={[styles.bar, { left: inset, width: shown * Math.max(0, width - inset * 2), height, marginTop: -radius, borderRadius: radius, backgroundColor: fillColor, overflow: "hidden" }]}>
        {!reduced && Array.from({ length: NOTE_SLOTS }, (_, i) => (
          <Note key={i} index={i} clock={clock} fade={fade} level={level} span={span} size={Math.max(5, height - 1.5)} barHeight={height} thumbRadius={thumbRadius} />
        ))}
      </View>
      {!reduced && [0, 1].map((j) => (
        <Echo key={j} offset={j} clock={clock} fade={fade} level={level} span={span} inset={inset} />
      ))}
    </View>
  );
};

function Note({ index, clock, fade, level, span, size, barHeight, thumbRadius }: {
  index: number; clock: SharedValue<number>; fade: SharedValue<number>; level: SharedValue<number>; span: SharedValue<number>;
  size: number; barHeight: number; thumbRadius: number;
}) {
  const style = useAnimatedStyle(() => {
    const fillEnd = Math.max(0, level.value * span.value - thumbRadius);
    const count = Math.max(1, Math.min(NOTE_SLOTS, Math.round(fillEnd / 40)));
    if (index >= count || fillEnd <= size * 1.5) return { opacity: 0 };
    const travel = Math.max(fillEnd, size * 2);
    const speed = 10 + 14 * level.value;
    const p = (((clock.value * speed) / travel + index / count) % 1 + 1) % 1;
    const x = p * travel - size / 2;
    const room = Math.max(0, Math.min(1, (fillEnd - x - size) / size));
    return { opacity: 0.5 * fade.value * Math.sin(Math.PI * p) * room, transform: [{ translateX: x }] };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: (barHeight - size) / 2, width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 12 12">
        {NOTE_PATHS[index % 2].map((d) => <Path key={d} d={d} fill={INK} />)}
      </Svg>
    </Animated.View>
  );
}

/** One thin arc to the right of the handle per beat: a ring with only its right edge inked. */
function Echo({ offset, clock, fade, level, span, inset }: {
  offset: number; clock: SharedValue<number>; fade: SharedValue<number>; level: SharedValue<number>; span: SharedValue<number>;
  inset: number;
}) {
  const base = inset + 2;
  const grow = 12;
  const size = (base + grow) * 2;
  const style = useAnimatedStyle(() => {
    const beats = (clock.value * BPM) / 60;
    const age = ((((beats + offset) / 2) % 1) * 2) / ECHO_LIFE;
    const thumbX = inset + level.value * span.value;
    if (age >= 1) return { opacity: 0, transform: [{ translateX: thumbX - size / 2 }, { scale: 0 }] };
    const radius = base + age * grow;
    return {
      opacity: 0.55 * fade.value * (0.55 + 0.45 * level.value) * Math.pow(1 - age, 1.6),
      transform: [{ translateX: thumbX - size / 2 }, { scale: radius / (base + grow) }],
    };
  });
  return (
    <Animated.View
      style={[{ position: "absolute", left: 0, top: "50%", marginTop: -size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 1.3, borderColor: "transparent", borderRightColor: ECHO_INK }, style]}
    />
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", top: "50%" },
});
