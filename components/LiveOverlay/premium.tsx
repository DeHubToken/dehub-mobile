/**
 * The premium look every stream widget wears. The twin of the glass tokens in
 * dehubweb src/styles/live-overlay.css — keep the numbers in step, so a widget
 * reads the same over a phone stream as over a desktop one or in OBS.
 *
 * Glass is three layers: a cool gradient that is lighter where light would
 * catch it and darkest at the base, a hairline edge, and a one-pixel highlight
 * along the top lip, lifted off the picture by a long soft shadow.
 */
import React, { useEffect } from "react";
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/** 165deg: from just left of top-centre to just right of bottom-centre. */
const GLASS_COLORS = ["rgba(46,46,54,0.78)", "rgba(18,18,22,0.84)", "rgba(6,6,8,0.9)"] as const;
const GLASS_STOPS = [0, 0.46, 1] as const;
const GLASS_START = { x: 0.37, y: 0 };
const GLASS_END = { x: 0.63, y: 1 };

export const EDGE = "rgba(255,255,255,0.10)";
export const MUTED = "rgba(255,255,255,0.62)";
export const LIP = "inset 0px 1px 0px rgba(255,255,255,0.16), inset 0px -1px 0px rgba(0,0,0,0.45)";
export const DROP = "0px 18px 44px -14px rgba(0,0,0,0.65), 0px 3px 10px rgba(0,0,0,0.35)";

/**
 * A glass panel. `shadow` is off for panels that fill their whole widget box,
 * where the box would clip it anyway.
 */
export function Glass({
  radius,
  style,
  shadow = true,
  children,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  shadow?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View
      style={[
        {
          borderRadius: radius,
          borderWidth: 1,
          borderColor: EDGE,
          overflow: "hidden",
          boxShadow: shadow ? `${LIP}, ${DROP}` : LIP,
        },
        style,
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={GLASS_COLORS}
        locations={GLASS_STOPS}
        start={GLASS_START}
        end={GLASS_END}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}

/** Small caps label over a name or a figure. */
export function Eyebrow({ size, children, style }: { size: number; children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text
      numberOfLines={1}
      style={[
        {
          color: MUTED,
          fontSize: size,
          fontWeight: "700",
          letterSpacing: size * 0.16,
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The sliver of light down an alert's leading edge. */
export function AccentEdge({ height, color = "#ffffff" }: { height: number; color?: string }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["transparent", color, color, "transparent"]}
      locations={[0, 0.3, 0.7, 1]}
      style={{
        position: "absolute",
        left: 0,
        top: height * 0.18,
        bottom: height * 0.18,
        width: Math.max(2, height * 0.035),
        borderTopRightRadius: 999,
        borderBottomRightRadius: 999,
        opacity: 0.9,
      }}
    />
  );
}

/** A bright inner ring and a faint outer halo round an avatar. */
export function Ringed({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        boxShadow: `0px 0px 0px ${Math.max(1, size * 0.04)}px rgba(255,255,255,0.92), 0px 0px 0px ${Math.max(2, size * 0.11)}px rgba(255,255,255,0.12)`,
      }}
    >
      {children}
    </View>
  );
}

const MEDALS: Record<number, { colors: [string, string, string]; ink: string }> = {
  1: { colors: ["#fff1b8", "#f2c94c", "#b8860b"], ink: "#3b2a05" },
  2: { colors: ["#ffffff", "#d6dae0", "#8e959e"], ink: "#1f2329" },
  3: { colors: ["#ffd9b8", "#e0975a", "#9a5427"], ink: "#3a1d0b" },
};

/** A rank disc; brushed gold, silver and bronze for the podium. */
export function Medal({ place, size }: { place: number; size: number }) {
  const medal = MEDALS[place];
  const text = (
    <Text style={{ color: medal ? medal.ink : "rgba(255,255,255,0.85)", fontSize: size * 0.69, fontWeight: "800" }}>{place}</Text>
  );
  const disc: ViewStyle = {
    width: size,
    height: size,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  if (!medal) {
    return (
      <View style={[disc, { backgroundColor: "rgba(255,255,255,0.09)", boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.12)" }]}>{text}</View>
    );
  }
  return (
    <LinearGradient colors={medal.colors} locations={[0, 0.45, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={disc}>
      {text}
    </LinearGradient>
  );
}

/** An icon in its own small disc, as the counters show it. */
export function IconDisc({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <View
      style={{
        width: size * 1.56,
        height: size * 1.56,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.10)",
        boxShadow: "inset 0px 1px 0px rgba(255,255,255,0.14)",
      }}
    >
      {children}
    </View>
  );
}

/** The pulsing red dot on the audience count. */
export function LiveDot({ size }: { size: number }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.45, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(o);
  }, [o]);
  const pulse = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: 999,
          backgroundColor: "#ff3b4e",
          boxShadow: `0px 0px 0px ${size * 0.35}px rgba(255,59,78,0.25), 0px 0px ${size * 1.4}px rgba(255,59,78,0.8)`,
        },
        pulse,
      ]}
    />
  );
}

/** A slow sheen passing along a bar, every 3.6 seconds. */
export function Sheen({ width }: { width: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    if (!width) return;
    x.value = -1;
    x.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(x);
  }, [width, x]);
  const move = useAnimatedStyle(() => ({ transform: [{ translateX: x.value * width }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", top: 0, bottom: 0, left: 0, width }, move]}>
      <LinearGradient
        colors={["transparent", "rgba(255,255,255,0.28)", "transparent"]}
        locations={[0.3, 0.5, 0.7]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.6 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

/** Hex accent at a given opacity, for gradient stops. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** A list row, with a hairline above every row but the first. */
export function ListRow({ row, first, children }: { row: number; first: boolean; children: React.ReactNode }) {
  return (
    <View
      style={{
        height: row,
        flexDirection: "row",
        alignItems: "center",
        gap: row * 0.3,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: "rgba(255,255,255,0.06)",
      }}
    >
      {children}
    </View>
  );
}
