import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ViewStyle, StyleProp } from "react-native";

export const ACCENT_GRADIENT_COLORS = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
] as const;


const AccentButtonGradient: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}> = ({ children, style, borderRadius = 12 }) => (
  <LinearGradient
    colors={ACCENT_GRADIENT_COLORS}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={[
      {
        borderRadius,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.30)",
      },
      style,
    ]}
  >
    {children}
  </LinearGradient>
);

export default AccentButtonGradient;
