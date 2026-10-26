import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SHEET_GLASS_FILL, SHEET_GLASS_FILL_BLURRED } from "../../theme/sheetGlass";
import { useAppTheme } from "../../context/ThemeContext";

/**
 * The liquid glass layer behind a drawer's content, as on web: a dark wash
 * (blurred on iOS), with a faint white sheen running down from the top edge.
 * The panel it sits in must have a transparent background of its own.
 */
export default function SheetGlass() {
  const ios = Platform.OS === "ios";
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {ios ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: ios ? SHEET_GLASS_FILL_BLURRED : SHEET_GLASS_FILL }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0)"]}
        locations={[0, 0.35]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * A drawer's background in any theme: liquid glass in the default dark theme,
 * the theme's own sheet material under the canvas themes, Minimal and Light.
 */
export function DrawerSurface() {
  const { skin, isMinimal, isLight } = useAppTheme();
  if (!skin && !isMinimal && !isLight) return <SheetGlass />;
  // Required here, as GlassModal does, so the glass alone stays light to load.
  const ThemeSurface = require("./ThemeSurface").default;
  return <ThemeSurface />;
}
