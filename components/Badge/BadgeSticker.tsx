/**
 * BadgeSticker — a badge as a die-cut holographic sticker.
 *
 * No GL here (it would mean a native dependency and a store build instead of
 * an OTA), so the sticker is layered views: a soft shadow and a white cut
 * border grown from the tier's plate silhouette, a rainbow sheen masked to
 * that border, the artwork, and a glare band masked to the whole sticker.
 * Dragging tilts it in 3D, and every layer moves off the same two angles —
 * that shared motion is what sells the foil.
 */
import React, { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

/**
 * What a sticker is cut from: the artwork, and a solid silhouette of it for
 * the paper edge, the shadow and the foil masks. Both fill their parent.
 */
export interface StickerArt {
  /** Stable per artwork; seeds the glitter so it never reshuffles. */
  key: string;
  /** The artwork as a bundled image, for anything that draws it itself (the Skia shatter). */
  source?: number;
  renderArt: () => ReactNode;
  renderPlate: (color: string, blur?: number) => ReactNode;
}

interface Props {
  art: StickerArt;
  /** Sticker size, cut border included. */
  size: number;
  /** Resting tilt in degrees. */
  tilt?: number;
  onTap?: () => void;
  onInteract?: () => void;
  /**
   * Wake up on mount: start as the bare art (matching the flying copy it
   * takes over from), then grow the paper edge, bring the foil in and throw a
   * small burst of sparks, rather than jumping to glitter in one frame.
   */
  reveal?: boolean;
}

/**
 * The artwork's share of the sticker. The plate is already grown past the
 * art, so a small margin is enough for a thin white edge that hugs it.
 */
export const ART_SHARE = 0.95;
const MAX_TILT = 26;
/** Rainbow strength on the foil: toned to read as metal first, rainbow second. */
const HOLO_STRENGTH = 0.33;
const RAINBOW = ["#ff6b8b", "#ffc46b", "#fff27a", "#7dffc0", "#6ad8ff", "#a98bff", "#ff7ae6", "#ff6b8b"] as const;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(max, Math.max(min, value));
}

/** Seeded so a re-render never reshuffles the glitter. */
function sparklePoints(seed: string, count: number) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
  return Array.from({ length: count }, () => {
    const angle = rand() * Math.PI * 2;
    const radius = 0.3 + rand() * 0.16;
    return {
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
      phase: rand() * Math.PI * 2,
      scale: 0.6 + rand() * 0.7,
    };
  });
}

const REVEAL_MS = 1100;

export default function BadgeSticker({ art, size, tilt = 0, onTap, onInteract, reveal = false }: Props) {
  const intro = useSharedValue(reveal ? 0 : 1);
  useEffect(() => {
    if (reveal) intro.value = withTiming(1, { duration: REVEAL_MS, easing: Easing.out(Easing.quad) });
  }, [reveal, intro]);
  // Paper and shadow come in over the first half, the foil over the rest.
  const paperStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, intro.value * 2) }));
  const shineStyle = useAnimatedStyle(() => {
    const k = clamp((intro.value - 0.2) / 0.8, 0, 1);
    return { opacity: k * k * (3 - 2 * k) };
  });
  const rotX = useSharedValue(0);
  const rotY = useSharedValue(0);
  const press = useSharedValue(0);
  const sway = useSharedValue(0);

  useEffect(() => {
    sway.value = withRepeat(withTiming(Math.PI * 2, { duration: 7000, easing: Easing.linear }), -1, false);
  }, [sway]);

  const tap = useCallback(() => onTap?.(), [onTap]);
  const interact = useCallback(() => onInteract?.(), [onInteract]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(4)
      .onBegin(() => {
        press.value = withTiming(1, { duration: 120 });
        runOnJS(interact)();
      })
      .onUpdate((e) => {
        rotY.value = clamp((e.translationX / size) * 70, -MAX_TILT, MAX_TILT);
        rotX.value = clamp((-e.translationY / size) * 70, -MAX_TILT, MAX_TILT);
      })
      .onFinalize(() => {
        press.value = withTiming(0, { duration: 180 });
        rotX.value = withSpring(0, { damping: 8, stiffness: 110 });
        rotY.value = withSpring(0, { damping: 8, stiffness: 110 });
      });
    const tapGesture = Gesture.Tap()
      .maxDuration(300)
      .onEnd((_e, success) => {
        if (success) runOnJS(tap)();
      });
    return Gesture.Race(pan, tapGesture);
  }, [size, press, rotX, rotY, tap, interact]);

  // The drag angle plus a slow idle sway, so the foil never sits still.
  const ax = useDerivedValue(() => rotX.value + Math.sin(sway.value) * 5);
  const ay = useDerivedValue(() => rotY.value + Math.cos(sway.value) * 7);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateX: `${ax.value}deg` },
      { rotateY: `${ay.value}deg` },
      { rotateZ: `${tilt}deg` },
      { scale: 1 - press.value * 0.035 },
    ],
  }));

  const shadowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -ay.value * 0.9 },
      { translateY: size * 0.06 + ax.value * 0.6 },
      { rotateZ: `${tilt}deg` },
      { scale: 1 - press.value * 0.05 },
    ],
  }));

  const holoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (-ay.value / MAX_TILT) * size * 0.9 },
      { translateY: (ax.value / MAX_TILT) * size * 0.4 },
    ],
  }));

  const glareStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (ay.value / MAX_TILT) * size * 0.85 },
      { translateY: (-ax.value / MAX_TILT) * size * 0.85 },
    ],
  }));

  const artSize = size * ART_SHARE;
  const sparkles = useMemo(() => sparklePoints(art.key, 14), [art.key]);

  const plateImage = <View style={{ width: size, height: size }}>{art.renderPlate("#000")}</View>;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: size, height: size }}>
        {/* Cast shadow, flat on the table while the sticker tilts above it. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadowStyle]}>
          <Animated.View style={paperStyle}>
            <View style={{ width: size, height: size, opacity: 0.55 }}>{art.renderPlate("#000", 10)}</View>
          </Animated.View>
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, cardStyle]}>
          {/* Cut border. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, paperStyle]}>
            <View style={{ position: "absolute", width: size, height: size }}>{art.renderPlate("#f3f3f6")}</View>
          </Animated.View>

          {/* Rainbow foil on the border and in the gaps. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shineStyle]}>
          <MaskedView style={StyleSheet.absoluteFill} maskElement={plateImage}>
            <Animated.View style={[{ position: "absolute", left: -size, top: -size * 0.5, width: size * 3, height: size * 2, opacity: HOLO_STRENGTH }, holoStyle]}>
              <LinearGradient colors={RAINBOW} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </MaskedView>
          </Animated.View>

          <View style={{ position: "absolute", left: (size - artSize) / 2, top: (size - artSize) / 2, width: artSize, height: artSize }}>
            {art.renderArt()}
          </View>

          {/* Glare band and a faint holo wash across everything. */}
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shineStyle]}>
          <MaskedView style={StyleSheet.absoluteFill} maskElement={plateImage} pointerEvents="none">
            <Animated.View style={[{ position: "absolute", left: -size * 0.7, top: -size * 0.7, width: size * 2.4, height: size * 2.4 }, glareStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)", "rgba(255,255,255,0)"]}
                locations={[0, 0.38, 0.5, 0.62, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient colors={RAINBOW} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { opacity: HOLO_STRENGTH * 0.26 }]} />
            </Animated.View>
          </MaskedView>
          </Animated.View>

          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shineStyle]}>
            {sparkles.map((s, i) => (
              <Sparkle key={i} x={s.x * size} y={s.y * size} scale={s.scale} phase={s.phase} ax={ax} ay={ay} />
            ))}
          </Animated.View>
        </Animated.View>

        {reveal ? <GlitterBurst size={size} seed={art.key} /> : null}
      </View>
    </GestureDetector>
  );
}

/** A ring of small sparks thrown off the rim as the sticker wakes up. */
function GlitterBurst({ size, seed }: { size: number; seed: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: 1000, easing: Easing.linear });
  }, [progress]);
  const parts = useMemo(() => {
    let h = 7;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const rand = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    return Array.from({ length: 22 }, (_, i) => ({
      angle: (i / 22) * Math.PI * 2 + (rand() - 0.5) * 0.35,
      travel: 0.1 + rand() * 0.2,
      spark: 7 + rand() * 7,
      delay: rand() * 0.18,
    }));
  }, [seed]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {parts.map((part, i) => (
        <BurstSpark key={i} {...part} size={size} progress={progress} />
      ))}
    </View>
  );
}

function BurstSpark({
  angle,
  travel,
  spark,
  delay,
  size,
  progress,
}: {
  angle: number;
  travel: number;
  spark: number;
  delay: number;
  size: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const k = clamp((progress.value - delay) / (1 - delay), 0, 1);
    const ease = 1 - Math.pow(1 - k, 3);
    const r = size * (0.42 + travel * ease);
    return {
      opacity: (1 - k) * Math.min(1, k * 10),
      transform: [
        { translateX: Math.cos(angle) * r },
        { translateY: Math.sin(angle) * r + k * k * size * 0.06 },
        { scale: 1 - 0.45 * k },
        { rotateZ: "45deg" },
      ],
    };
  });
  return (
    <Animated.View
      style={[{ position: "absolute", left: size / 2 - spark / 2, top: size / 2 - spark / 2, width: spark, height: spark }, style]}
    >
      <View style={{ position: "absolute", left: spark / 2 - 0.75, top: 0, width: 1.5, height: spark, borderRadius: 1, backgroundColor: "#fff" }} />
      <View style={{ position: "absolute", left: 0, top: spark / 2 - 0.75, width: spark, height: 1.5, borderRadius: 1, backgroundColor: "#fff" }} />
    </Animated.View>
  );
}

/** A four-point glint that catches the light at its own tilt. */
function Sparkle({
  x,
  y,
  scale,
  phase,
  ax,
  ay,
}: {
  x: number;
  y: number;
  scale: number;
  phase: number;
  ax: SharedValue<number>;
  ay: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const light = Math.sin(phase + ay.value * 0.22 + ax.value * 0.17);
    return {
      opacity: clamp(light * 1.8 - 0.8, 0, 1),
      transform: [{ scale: scale * (0.7 + clamp(light, 0, 1) * 0.5) }, { rotateZ: "45deg" }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x - 5, top: y - 5, width: 10, height: 10 }, style]}>
      <View style={{ position: "absolute", left: 4.25, top: 0, width: 1.5, height: 10, borderRadius: 1, backgroundColor: "#fff" }} />
      <View style={{ position: "absolute", left: 0, top: 4.25, width: 10, height: 1.5, borderRadius: 1, backgroundColor: "#fff" }} />
    </Animated.View>
  );
}
