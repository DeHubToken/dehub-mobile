import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

interface GlassIndicatorProps {
  borderRadius?: number;
  /**
   * Backdrop blur (web: backdrop-blur-xl). iOS only — Android's experimental
   * blur crashes when list views mutate during its pre-draw snapshot (same
   * constraint as FeedNavBar's background). Off by default: enable it on
   * low-count chrome (feed nav, tab bars), not on per-list-item glass like
   * message bubbles where dozens of UIVisualEffectViews would hurt perf.
   */
  blurIntensity?: number;
}

const GRADIENT_COLORS: [string, string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
];

const GlassIndicator: React.FC<GlassIndicatorProps> = ({
  borderRadius = 12,
  blurIntensity,
}) => (
  <View
    style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}
    pointerEvents="none"
  >
    {Platform.OS === "ios" && !!blurIntensity && (
      <BlurView
        intensity={blurIntensity}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
    )}
    <LinearGradient
      colors={GRADIENT_COLORS}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.30)",
        },
      ]}
    />
    {/* Web's inset highlights: inset 0 1px 0 white/40 (top) and
        inset 0 -1px 0 white/10 (bottom) — emulated with hairlines since RN
        has no inset shadows. */}
    <View style={styles.insetTop} />
    <View style={styles.insetBottom} />
  </View>
);

const styles = StyleSheet.create({
  insetTop: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.40)",
  },
  insetBottom: {
    position: "absolute",
    bottom: 1,
    left: 1,
    right: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
});

// No Android elevation: on a transparent wrapper it renders as a harsh black
// rectangle. The GlassIndicator's white border/gradient provides the pop
// (matches web's inset-highlight approach); iOS keeps a soft ambient shadow.
export const GLASS_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.2,
  shadowRadius: 16,
} as const;

export default GlassIndicator;
