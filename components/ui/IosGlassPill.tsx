import React from "react";
import { StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  /** Colour washed over the blur. Keep it thin (alpha ~0.2) so posts show through. */
  tint: string;
  borderRadius: number;
};

/**
 * iOS liquid glass for the floating pills: the system's ultra-thin material
 * (the same backdrop iOS draws under its own tab bars), a thin theme wash, a
 * specular sheen across the top half and a bright rim. A dark blur under a
 * heavy tint read as a smoked slab rather than glass. iOS only; Android has
 * no safe backdrop blur and keeps its solid pills.
 */
export default function IosGlassPill({ tint, borderRadius }: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]} pointerEvents="none">
      <BlurView intensity={70} tint="systemUltraThinMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.04)", "rgba(255,255,255,0)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius,
            borderWidth: StyleSheet.hairlineWidth * 2,
            borderColor: "rgba(255,255,255,0.22)",
            borderTopColor: "rgba(255,255,255,0.45)",
          },
        ]}
      />
    </View>
  );
}
