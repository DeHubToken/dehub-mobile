/**
 * The look every badge showcase shares: the chrome and glass buttons, one
 * spacing and radius scale, the dock thumbnail tilts, and the styles for
 * panels and tiles, so the holder and streamer showcases line up to the
 * pixel. Every value is web's (dehubweb `badge-showcase/showcase-ui.ts` and
 * the Tailwind classes in its showcases): 1px borders, not hairlines, since a
 * CSS pixel is a dp here.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Easing, withTiming } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

/** One gap, radius and padding for every panel, tile and button. */
export const GAP = 8;
export const RADIUS = 16;
export const PAD = 12;

/** Resting tilt of each dock thumbnail, in degrees; matches web. */
export const TILTS = [-4, 6, -7, 5, -5, 7, -6, 4, -8, 6, -4, 7, -6];
export const tiltAt = (i: number) => TILTS[i % TILTS.length];

const SWAP_EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Web's text swap: the new value rises `distance` into place. */
function riseIn(distance: number, duration: number) {
  const timing = { duration, easing: SWAP_EASE };
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 0, transform: [{ translateY: distance }] },
      animations: { opacity: withTiming(1, timing), transform: [{ translateY: withTiming(0, timing) }] },
    };
  };
}

/** ...and the old one rises the same distance out. */
function riseOut(distance: number, duration: number) {
  const timing = { duration, easing: SWAP_EASE };
  return () => {
    "worklet";
    return {
      initialValues: { opacity: 1, transform: [{ translateY: 0 }] },
      animations: { opacity: withTiming(0, timing), transform: [{ translateY: withTiming(-distance, timing) }] },
    };
  };
}

/** The heading's swap (10px, 280ms) and a tile value's (8px, 250ms), as on web. */
export const TITLE_IN = riseIn(10, 280);
export const TITLE_OUT = riseOut(10, 280);
export const VALUE_IN = riseIn(8, 250);
export const VALUE_OUT = riseOut(8, 250);

const CHROME_LIGHT = ["#fdfdfe", "#e1e4e8", "#a8adb5", "#eceef1", "#c2c6cc", "#f6f7f8"] as const;
const CHROME_LIGHT_STOPS = [0, 0.16, 0.47, 0.53, 0.78, 1] as const;
const CHROME_DARK = ["#50545b", "#2c2f34", "#15171a", "#2d3035"] as const;
const CHROME_DARK_STOPS = [0, 0.45, 0.55, 1] as const;

/** Polished chrome, or gunmetal with `dark`: web's `.bs-chrome` / `.bs-chrome-dark`. */
export function Chrome({
  dark,
  style,
  children,
  onPress,
  hitSlop,
  disabled,
  accessibilityLabel,
}: {
  dark?: boolean;
  style?: object;
  children: React.ReactNode;
  onPress: () => void;
  hitSlop?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={hitSlop}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        ui.chrome,
        { borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.3)" },
        style,
        disabled && { opacity: 0.55 },
        pressed && !disabled && { transform: [{ translateY: 1 }] },
      ]}
    >
      <LinearGradient
        colors={dark ? CHROME_DARK : CHROME_LIGHT}
        locations={dark ? CHROME_DARK_STOPS : CHROME_LIGHT_STOPS}
        style={StyleSheet.absoluteFill}
      />
      {/* The lit top edge and the shaded bottom one. */}
      <View pointerEvents="none" style={[ui.lipTop, { backgroundColor: dark ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.95)" }]} />
      <View pointerEvents="none" style={[ui.lipBottom, { backgroundColor: dark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)" }]} />
      {children}
    </Pressable>
  );
}

/**
 * Web's LiquidGlassBubble2 as the showcase uses it: 40px, 12px corners,
 * frosted white, or solid white with black text when `active`.
 */
export function GlassButton({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [ui.glass, active && ui.glassActive, pressed && { opacity: 0.85 }]}
    >
      {!active ? (
        <>
          <LinearGradient
            colors={["rgba(255,255,255,0.2)", "rgba(255,255,255,0.1)", "rgba(255,255,255,0.05)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={["rgba(255,255,255,0.1)", "rgba(255,255,255,0)"]}
            locations={[0, 0.5]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={["rgba(255,255,255,0.05)", "rgba(255,255,255,0)"]} style={ui.glassInner} />
        </>
      ) : null}
      <Text style={[ui.glassText, active && { color: "#000" }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  overline: { color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#fff", fontSize: 22, lineHeight: 22, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.44 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 10, rowGap: 6 },
  chip: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  chipText: { color: "#fff", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipDivider: { width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.2)" },
  muted: { color: "rgba(255,255,255,0.55)", fontSize: 12, lineHeight: 16, textAlign: "center" },
  card: {
    marginTop: 12,
    padding: PAD,
    borderRadius: RADIUS,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 20, gap: 8 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  amount: { color: "#fff", fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tinyRow: { marginTop: 6, height: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tiny: { color: "rgba(255,255,255,0.35)", fontSize: 10, lineHeight: 12, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: GAP },
  tile: {
    height: 68,
    padding: PAD,
    borderRadius: RADIUS,
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  tileLit: { backgroundColor: "rgba(255,255,255,0.07)", borderColor: "rgba(255,255,255,0.2)" },
  tileHead: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  tileIcon: { width: 12, height: 12, alignItems: "center", justifyContent: "center" },
  tileLabel: { flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 10, lineHeight: 12, height: 24 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 4, height: 18, overflow: "hidden" },
  tileValue: { flexShrink: 1, color: "#fff", fontSize: 14, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  up: { color: "#34d399", fontSize: 9, fontWeight: "700" },
  actions: { flexDirection: "row", gap: GAP, marginTop: GAP },
  button: { flex: 1, height: 40, borderRadius: RADIUS, paddingHorizontal: PAD, flexDirection: "row", gap: 6 },
  chrome: { overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: 1 },
  lipTop: { position: "absolute", top: 0, left: 0, right: 0, height: 1 },
  lipBottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 1 },
  glass: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  glassActive: { backgroundColor: "#ffffff" },
  glassInner: { position: "absolute", top: 1, left: 1, right: 1, bottom: 1, borderRadius: 11 },
  glassText: { color: "#fff", fontSize: 14, lineHeight: 16, fontWeight: "500" },
  chromeText: { color: "#0b0c0e", fontSize: 13, fontWeight: "700", textShadowColor: "rgba(255,255,255,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  chromeTextDark: { color: "#f3f4f6", fontSize: 13, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.1)" },
});

/** Three tiles and two gaps across a column that is the window less 16px either side. */
export const tileWidthFor = (windowWidth: number) => Math.floor((Math.min(windowWidth - 32, 480) - GAP * 2) / 3);
