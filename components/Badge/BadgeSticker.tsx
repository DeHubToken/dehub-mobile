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
import React, { useCallback, useEffect, useMemo } from "react";
import { Image, StyleSheet, View } from "react-native";
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
import { badgeImage } from "../../libs/misc";
import { BADGE_PLATES } from "../../libs/badgePlates";

interface Props {
  tier: string;
  /** Sticker size, cut border included. */
  size: number;
  /** Resting tilt in degrees. */
  tilt?: number;
  onTap?: () => void;
  onInteract?: () => void;
}

/** The artwork's share of the sticker; the rest is cut border. */
export const ART_SHARE = 0.84;
const MAX_TILT = 26;
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

export default function BadgeSticker({ tier, size, tilt = 0, onTap, onInteract }: Props) {
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

  const plate = BADGE_PLATES[tier];
  const art = badgeImage(tier, "light") ?? badgeImage(tier);
  const artSize = size * ART_SHARE;
  const sparkles = useMemo(() => sparklePoints(tier, 14), [tier]);

  const plateImage = <Image source={plate} style={{ width: size, height: size }} resizeMode="contain" />;

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: size, height: size }}>
        {/* Cast shadow, flat on the table while the sticker tilts above it. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, shadowStyle]}>
          <Image
            source={plate}
            blurRadius={10}
            resizeMode="contain"
            style={{ width: size, height: size, tintColor: "#000", opacity: 0.55 }}
          />
        </Animated.View>

        <Animated.View style={[StyleSheet.absoluteFill, cardStyle]}>
          {/* Cut border. */}
          <Image source={plate} resizeMode="contain" style={{ position: "absolute", width: size, height: size, tintColor: "#f3f3f6" }} />

          {/* Rainbow foil on the border and in the gaps. */}
          <MaskedView style={StyleSheet.absoluteFill} maskElement={plateImage}>
            <Animated.View style={[{ position: "absolute", left: -size, top: -size * 0.5, width: size * 3, height: size * 2, opacity: 0.5 }, holoStyle]}>
              <LinearGradient colors={RAINBOW} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </MaskedView>

          <Image
            source={art}
            resizeMode="contain"
            style={{ position: "absolute", left: (size - artSize) / 2, top: (size - artSize) / 2, width: artSize, height: artSize }}
          />

          {/* Glare band and a faint holo wash across everything. */}
          <MaskedView style={StyleSheet.absoluteFill} maskElement={plateImage} pointerEvents="none">
            <Animated.View style={[{ position: "absolute", left: -size * 0.7, top: -size * 0.7, width: size * 2.4, height: size * 2.4 }, glareStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,0.5)", "rgba(255,255,255,0)", "rgba(255,255,255,0)"]}
                locations={[0, 0.38, 0.5, 0.62, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <LinearGradient colors={RAINBOW} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, { opacity: 0.13 }]} />
            </Animated.View>
          </MaskedView>

          {sparkles.map((s, i) => (
            <Sparkle key={i} x={s.x * size} y={s.y * size} scale={s.scale} phase={s.phase} ax={ax} ay={ay} />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
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
