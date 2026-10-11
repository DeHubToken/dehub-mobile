import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import IosGlassPill from "./IosGlassPill";
import { androidFrostSupported, useFrostedSource } from "./FrostedBackdrop";
import { useFeedSurfaceActive } from "../../libs/visualActivity";

/** Shared pill material. Geometry and controls belong to the existing caller. */
export default function FrostedPill({ tint, borderRadius }: { tint: string; borderRadius: number }) {
  const target = useFrostedSource();
  const surfaceActive = useFeedSurfaceActive();
  if (Platform.OS === "ios") return <IosGlassPill tint={tint} borderRadius={borderRadius} />;
  // Opacity on a covered page does not stop native blur target sampling.
  const blur = androidFrostSupported && !!target && surfaceActive;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}>
      {blur ? (
        <BlurView
          blurTarget={target}
          blurMethod="dimezisBlurViewSdk31Plus"
          intensity={65}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#18181B" }]} />}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.025)", "rgba(255,255,255,0)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { borderRadius, borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: "rgba(255,255,255,0.22)", borderTopColor: "rgba(255,255,255,0.4)" }]} />
    </View>
  );
}
