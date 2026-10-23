import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_TAB_LINE } from "../../theme/minimal";
import { KeepDarkScope } from "../../libs/jsx/tone";

interface GlassIndicatorProps {
  borderRadius?: number;
}

const GRADIENT_COLORS: [string, string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
];

const GlassIndicator: React.FC<GlassIndicatorProps> = ({
  borderRadius = 12,
}) => {
  const { isMinimal, skin, isLight } = useAppTheme();
  // System Light: web's active tab, a white chip lifted off the pale pill.
  if (isLight && !skin && !isMinimal) {
    return (
      <KeepDarkScope>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.lightChip, { borderRadius }]} />
      </KeepDarkScope>
    );
  }
  // Minimal has no glass: no blur, gradient or highlight lines, just the one
  // flat outline that marks the selection.
  if (isMinimal) {
    return (
      <View
        style={[StyleSheet.absoluteFill, styles.minimalOutline]}
        pointerEvents="none"
      />
    );
  }
  if (skin) {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, skin.centre, { borderRadius: skin.square ? 0 : borderRadius }]}
      />
    );
  }
  return (
    <View
      style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}
      pointerEvents="none"
    >
      {/* The stationary parent owns the frost; moving selections only tint it. */}
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
            borderTopColor: "rgba(255,255,255,0.40)",
            borderBottomColor: "rgba(255,255,255,0.10)",
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  lightChip: {
    backgroundColor: "#FFFFFF",
    boxShadow: "0px 0px 0px 0.5px rgba(11,11,13,0.06), 0px 1px 2px rgba(11,11,13,0.08), 0px 3px 10px -2px rgba(11,11,13,0.10)",
  },
  minimalOutline: {
    borderWidth: 1,
    borderColor: MINIMAL_TAB_LINE,
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
