import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface GlassIndicatorProps {
  borderRadius?: number;
}

const GRADIENT_COLORS: [string, string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
];

const GlassIndicator: React.FC<GlassIndicatorProps> = ({ borderRadius = 12 }) => (
  <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]} pointerEvents="none">
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
  </View>
);

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
