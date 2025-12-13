import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

interface FakeGlassProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

/**
 * FakeGlass - A lightweight glass effect using semi-transparent layers
 * Perfect for small overlays where real blur isn't needed
 * Works everywhere: iOS, Android, modals, on top of images
 */
const FakeGlass: React.FC<FakeGlassProps> = ({
  children,
  className = "",
  style,
}) => {
  return (
    <View
      className={className}
      style={[
        {
          backgroundColor: "rgba(255, 255, 255, 0.14)",
          borderColor: "rgba(255, 255, 255, 0.25)",
          borderWidth: StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export default FakeGlass;
