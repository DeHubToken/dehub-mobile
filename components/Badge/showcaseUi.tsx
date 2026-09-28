/**
 * The look every badge showcase shares: the chrome button, one spacing and
 * radius scale, the dock thumbnail tilts, and the styles for panels and
 * tiles, so the holder and streamer showcases line up to the pixel.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/** One gap, radius and padding for every panel, tile and button. */
export const GAP = 8;
export const RADIUS = 16;
export const PAD = 12;

/** Resting tilt of each dock thumbnail, in degrees; matches web. */
export const TILTS = [-4, 6, -7, 5, -5, 7, -6, 4, -8, 6, -4, 7, -6];
export const tiltAt = (i: number) => TILTS[i % TILTS.length];

const CHROME_LIGHT = ["#fdfdfe", "#e1e4e8", "#a8adb5", "#eceef1", "#c2c6cc", "#f6f7f8"] as const;
const CHROME_LIGHT_STOPS = [0, 0.16, 0.47, 0.53, 0.78, 1] as const;
const CHROME_DARK = ["#50545b", "#2c2f34", "#15171a", "#2d3035"] as const;
const CHROME_DARK_STOPS = [0, 0.45, 0.55, 1] as const;

/** Polished chrome, or gunmetal with `dark`: a banded gradient and a lit top edge. */
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
        { borderColor: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.35)" },
        style,
        disabled && { opacity: 0.55 },
        pressed && !disabled && { transform: [{ translateY: 1 }], opacity: 0.92 },
      ]}
    >
      <LinearGradient
        colors={dark ? CHROME_DARK : CHROME_LIGHT}
        locations={dark ? CHROME_DARK_STOPS : CHROME_LIGHT_STOPS}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[ui.chromeLip, { backgroundColor: dark ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.95)" }]}
      />
      {children}
    </Pressable>
  );
}

export const ui = StyleSheet.create({
  overline: { color: "rgba(255,255,255,0.4)", fontSize: 10, lineHeight: 12, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: "#fff", fontSize: 22, lineHeight: 24, fontWeight: "900", textTransform: "uppercase", letterSpacing: -0.4 },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: 10, rowGap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 5,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  chipText: { color: "#fff", fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  chipDivider: { width: StyleSheet.hairlineWidth, height: 14, backgroundColor: "rgba(255,255,255,0.25)" },
  muted: { color: "rgba(255,255,255,0.5)", fontSize: 12.5 },
  card: {
    marginTop: 12,
    padding: PAD,
    borderRadius: RADIUS,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 24, gap: 8 },
  label: { color: "rgba(255,255,255,0.45)", fontSize: 11, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  amount: { color: "#fff", fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tiny: { color: "rgba(255,255,255,0.35)", fontSize: 10.5, fontVariant: ["tabular-nums"] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: GAP },
  tile: {
    height: 68,
    padding: PAD,
    borderRadius: RADIUS,
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.035)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  tileLit: { backgroundColor: "rgba(255,255,255,0.08)", borderColor: "rgba(255,255,255,0.24)" },
  tileHead: { flexDirection: "row", alignItems: "flex-start", gap: 5 },
  tileIcon: { width: 13, height: 13, alignItems: "center", justifyContent: "center" },
  tileLabel: { flex: 1, color: "rgba(255,255,255,0.5)", fontSize: 10, lineHeight: 12, height: 24 },
  tileFoot: { flexDirection: "row", alignItems: "center", gap: 4, height: 18, overflow: "hidden" },
  tileValue: { flexShrink: 1, color: "#fff", fontSize: 14, lineHeight: 18, fontWeight: "700", fontVariant: ["tabular-nums"] },
  tileMuted: { flexShrink: 1, color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 18, fontWeight: "600" },
  up: { color: "#34d399", fontSize: 10, fontWeight: "700" },
  actions: { flexDirection: "row", gap: GAP, marginTop: GAP },
  button: { flex: 1, height: 40, borderRadius: RADIUS, paddingHorizontal: PAD },
  chrome: { overflow: "hidden", alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth },
  chromeLip: { position: "absolute", top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth * 2 },
  chromeText: { color: "#0b0c0e", fontSize: 13, fontWeight: "700", textShadowColor: "rgba(255,255,255,0.6)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 0 },
  chromeTextDark: { color: "#f3f4f6", fontSize: 13, fontWeight: "700", textShadowColor: "rgba(0,0,0,0.55)", textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.12)" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: "#fff" },
});

/** Three tiles and two gaps across a column that is the window less 16px either side. */
export const tileWidthFor = (windowWidth: number) => Math.floor((windowWidth - 32 - GAP * 2) / 3);
