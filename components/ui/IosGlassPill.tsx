import React from "react";
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  /** Colour washed over the blur. Keep it thin (alpha ~0.2) so posts show through. */
  tint: string;
  borderRadius: number;
  bordered?: boolean;
  blurEnabled?: boolean;
};

/**
 * iOS liquid glass for the floating pills: the system's ultra-thin material
 * (the same backdrop iOS draws under its own tab bars), a thin theme wash, a
 * specular sheen across the top half and a bright rim. A dark blur under a
 * heavy tint read as a smoked slab rather than glass. FrostedPill supplies
 * the separately targeted Android material.
 */
export default function IosGlassPill({ tint, borderRadius, bordered = true, blurEnabled = true }: Props) {
  return (
    // Keep the stationary material as its own native view when tab controls move.
    <View collapsable={false} style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]} pointerEvents="none">
      {blurEnabled ? <BlurView intensity={70} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#18181B" }]} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {bordered && <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: "rgba(255,255,255,0.22)",
            borderTopColor: "rgba(255,255,255,0.45)",
          },
        ]}
      />}
    </View>
  );
}
