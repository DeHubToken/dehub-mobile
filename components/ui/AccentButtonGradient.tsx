import React from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ViewStyle, StyleProp } from "react-native";

export const ACCENT_GRADIENT_COLORS = [
  "#b9d6f7ff", // light blue
  "#256DFA", // deep blue
] as const;


const AccentButtonGradient: React.FC<{
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
}> = ({ children, style, borderRadius = 14 }) => (
  <LinearGradient
    colors={ACCENT_GRADIENT_COLORS}
    start={{ x: 0, y: 0.2 }}
    end={{ x: 1, y: 0.2 }}
    style={[
      { borderRadius, overflow: "hidden" },
      style,
    ]}
  >
    {children}
  </LinearGradient>
);

export default AccentButtonGradient;
