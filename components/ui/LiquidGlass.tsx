import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

/**
 * The surface colour every LiquidGlass panel paints. Opaque on purpose: see
 * the note on the component below.
 */
const SURFACE = "#18181B";
/** Web parity's inner highlight, which still reads as a raised edge. */
const SHEEN = "rgba(255,255,255,0.06)";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /**
   * Accepted and ignored. Callers used to tune a blur that never rendered on
   * Android; the surface is now a flat colour on both platforms. Kept so the
   * call sites still compile.
   */
  intensity?: number;
  tint?: "light" | "dark" | "default";
  noBlur?: boolean;
}

/**
 * A raised panel. Named for the frosted-glass effect it used to attempt.
 *
 * It no longer blurs, and the blur it had was never real on Android: expo-blur
 * defaults to `BlurMethod.NONE` there, which paints a flat tint instead of
 * sampling anything, and nothing in this app passes `experimentalBlurMethod`.
 * So every "glass" panel was in fact a translucent rectangle — here a 41% wash
 * plus a 10% white film, about 47% opaque, which let whatever sat behind it
 * read through the text on top.
 *
 * Turning on the real Android blur is not the fix. `dimezisBlurView`
 * re-snapshots the root view every frame and throws IndexOutOfBoundsException
 * when a list mutates its children mid-draw (Dimezis/BlurView #191), which
 * killed the process on fast scrolls when it was last enabled.
 */
const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className = "",
  style,
}) => (
  <View className={`overflow-hidden ${className}`} style={style}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SURFACE }]} />
    <View style={[StyleSheet.absoluteFill, { backgroundColor: SHEEN }]} />
    <View style={{ position: "relative" }}>{children}</View>
  </View>
);

export default LiquidGlass;
