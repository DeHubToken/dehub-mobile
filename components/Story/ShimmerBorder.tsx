import React from "react";
import { View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface ShimmerBorderProps {
  active: boolean;
  children: React.ReactNode;
  size: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/** Story ring — bright when unwatched, dim when watched (web ShimmerBorder). */
const ShimmerBorder: React.FC<ShimmerBorderProps> = ({
  active,
  children,
  size,
  borderRadius = 12,
  style,
}) => {
  if (active) {
    return (
      <LinearGradient
        colors={["rgba(255,255,255,0.65)", "rgba(255,255,255,0.28)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[{ padding: 2, borderRadius: borderRadius + 2, width: size, height: size }, style]}
      >
        <View style={{ borderRadius, overflow: "hidden", flex: 1 }}>{children}</View>
      </LinearGradient>
    );
  }

  return (
    <View
      style={[
        {
          padding: 2,
          borderRadius: borderRadius + 2,
          width: size,
          height: size,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          backgroundColor: "rgba(255,255,255,0.06)",
          opacity: 0.65,
        },
        style,
      ]}
    >
      <View style={{ borderRadius, overflow: "hidden", flex: 1 }}>{children}</View>
    </View>
  );
};

export default ShimmerBorder;
