import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ViewStyle, StyleProp } from "react-native";

export const ACCENT_GRADIENT_COLORS = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.08)",
] as const;


const AccentButtonGradient: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}> = ({ children, style, borderRadius = 12 }) => (
  <LinearGradient
    colors={ACCENT_GRADIENT_COLORS}
    start={{ x: 0, y: 0.2 }}
    end={{ x: 1, y: 0.2 }}
    style={[
      {
        borderRadius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.24)",
      },
      style,
    ]}
  >
    {children}
  </LinearGradient>
);

export default AccentButtonGradient;
