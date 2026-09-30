import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import IosGlassPill from "./IosGlassPill";
import { useAppTheme } from "../../context/ThemeContext";

/** Solid fill Android (and web) draws in place of glass: fully opaque, so
 *  nothing behind it reads through the icons. */
const CHROME_SOLID_FILL = "rgb(16,16,18)";
const CHROME_SOLID_BORDER = "rgba(255,255,255,0.12)";
/** Wash over the iOS blur: dark enough that white text reads on a bright photo. */
const IOS_DARK_TINT = "rgba(8,8,10,0.46)";

/** The tinted recipe: the theme accent at 20% over a thin dark base, a white
 *  sheen fading down and a bright inner rim. */
const TINT_ALPHA = 0.2;
const SHEEN = ["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)"] as const;
const RIM = "rgba(255,255,255,0.22)";
/** What the see-through base reads as over a typical frame, for the opaque
 *  Android fill the accent is mixed into. */
const SOLID_BASE: [number, number, number] = [34, 34, 38];

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

/** The accent laid over SOLID_BASE at TINT_ALPHA, as one opaque colour. */
function solidTint(rgb: Rgb): string {
  const mix = SOLID_BASE.map((base, i) => Math.round(base * (1 - TINT_ALPHA) + rgb[i] * TINT_ALPHA));
  return `rgb(${mix[0]},${mix[1]},${mix[2]})`;
}

/**
 * The backdrop for small chrome floating over media and the home feed's
 * island capsule. Glass on iOS; a solid fill with a hairline rim on Android,
 * which has no safe backdrop blur and is never see-through.
 *
 * `tinted` is the lighter look of the buttons over a post and the tools menu:
 * washed with the theme's accent rather than smoked. On Android it stays
 * opaque, in the same lighter colour.
 */
export default function ChromeSurface({ radius, tinted = false }: { radius: number; tinted?: boolean }) {
  const accent = useChromeAccent();
  if (tinted) {
    // iOS: the shared glass (its thin dark material is the base, and it
    // brings its own sheen and rim) with the accent washed over it.
    if (Platform.OS === "ios") {
      return <IosGlassPill tint={withAlpha(accent, TINT_ALPHA)} borderRadius={radius} />;
    }
    return (
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: solidTint(accent) }]} />
        <LinearGradient colors={SHEEN} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: RIM }]} />
      </View>
    );
  }
  if (Platform.OS === "ios") return <IosGlassPill tint={IOS_DARK_TINT} borderRadius={radius} />;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: radius,
          backgroundColor: CHROME_SOLID_FILL,
          borderWidth: 1,
          borderColor: CHROME_SOLID_BORDER,
        },
      ]}
    />
  );
}
