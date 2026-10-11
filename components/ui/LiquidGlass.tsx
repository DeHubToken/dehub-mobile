import React from "react";
import { View, StyleSheet, ViewStyle, Platform } from "react-native";
import { useAppTheme } from "../../context/ThemeContext";

const SURFACE = "#18181B";
const SHEEN = "rgba(255,255,255,0.06)";

interface LiquidGlassProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  /** Retained for existing callers; panels use static theme materials. */
  intensity?: number;
  tint?: "light" | "dark" | "default";
  noBlur?: boolean;
}

/** A bounded panel using the active Android theme material. */
const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className = "",
  style,
}) => {
  const { skin } = useAppTheme();
  const material = Platform.OS === "android" ? skin?.card : undefined;
  return (
    <View className={`overflow-hidden ${className}`} style={[material, style]}>
      {!material && <View style={[StyleSheet.absoluteFill, { backgroundColor: SURFACE }]} />}
      {!material && <View style={[StyleSheet.absoluteFill, { backgroundColor: SHEEN }]} />}
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
};

export default LiquidGlass;
