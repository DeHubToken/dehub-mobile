import React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import FrostedPill from "./FrostedPill";
import { useAppTheme } from "../../context/ThemeContext";
import { GRAIN } from "../../theme/skins";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";

/** Wash over the blur: dark enough that white text reads on a bright photo. */
const IOS_DARK_TINT = "rgba(8,8,10,0.46)";

/** The tinted recipe: the theme accent at 20% over a thin dark base, a white
 *  sheen fading down and a bright inner rim. */
const TINT_ALPHA = 0.2;

function rgbOf(color: string): Rgb | null {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

type Rgb = [number, number, number];

/**
 * The theme's accent as an RGB triplet: the theme context's own `accent`
 * where it provides one (the theme colour the pills and cards are tinted
 * with), else the palette's accent.
 */
function useChromeAccent(): Rgb {
  const theme = useAppTheme() as ReturnType<typeof useAppTheme> & { accent?: Rgb };
  return theme.accent ?? rgbOf(theme.colors.accent) ?? [255, 255, 255];
}

function withAlpha(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Shared frost for navigation pills and controls floating over media. */
export default function ChromeSurface({ radius, tinted = false }: { radius: number; tinted?: boolean }) {
  const accent = useChromeAccent();
  const { skin, isMinimal } = useAppTheme();
  if (isMinimal) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", borderRadius: 0, borderWidth: 1, borderColor: MINIMAL_HAIRLINE }]} />;
  }
  if (skin) {
    const corner = skin.square ? 0 : radius;
    const material = tinted ? skin.centre : skin.card;
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: corner, overflow: "hidden" }]}>
        {Platform.OS === "ios" ? <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        <View style={[StyleSheet.absoluteFill, material, { borderRadius: corner }]} />
        {skin.grain ? <Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} /> : null}
      </View>
    );
  }
  return <FrostedPill tint={tinted ? withAlpha(accent, TINT_ALPHA) : IOS_DARK_TINT} borderRadius={radius} />;
}
