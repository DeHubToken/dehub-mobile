import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { Platform } from "react-native";

interface LiquidGlassProps {
  children: React.ReactNode;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  className?: string;
  style?: ViewStyle;
  /** Use solid semi-transparent background instead of blur (useful for overlays on images) */
  noBlur?: boolean;
  /**
   * Opt in to REAL backdrop blur on Android (expo-blur's dimezisBlurView).
   *
   * Off by default, and only safe on surfaces that are conditionally mounted
   * and unmounted — modals, sheets, the drawer while open. Dimezis re-snapshots
   * the whole root view every frame and throws IndexOutOfBoundsException when a
   * list mutates children mid-draw (Dimezis/BlurView issue #191), so a blur left
   * mounted while a feed scrolls underneath crashes eventually. This is the same
   * rule FeedNavBar, FloatingBottomTabBar, GlassIndicator and GlassToast already
   * follow; it was previously applied unconditionally here, which left a
   * permanent Dimezis blur on AccountSettingsScreen.
   */
  androidBlur?: boolean;
}

/**
 * LiquidGlass wrapper component that applies a frosted glass effect
 * with blur and semi-transparent background
 */
const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  intensity = 60,
  tint = "dark",
  className = "",
  style,
  noBlur = false,
  androidBlur = false,
}) => {
  if (noBlur) {
    // Use backdrop-filter style blur simulation with semi-transparent layers
    return (
      <View className={`overflow-hidden ${className}`} style={style}>
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(0, 0, 0, 0.3)" },
          ]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { 
              backgroundColor: "rgba(255, 255, 255, 0.15)",
              backdropFilter: "blur(20px)", // CSS fallback for web
            } as any,
          ]}
        />
        <View style={{ position: "relative" }}>{children}</View>
      </View>
    );
  }

  return (
    <View className={`overflow-hidden ${className}`} style={style}>
      <BlurView
        intensity={intensity}
        tint={tint}
        style={StyleSheet.absoluteFill}
        {...(Platform.OS === "android" && androidBlur
          ? { experimentalBlurMethod: "dimezisBlurView" as const }
          : {})}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(255, 255, 255, 0.1)" },
        ]}
      />
      <View style={{ position: "relative" }}>{children}</View>
    </View>
  );
};

export default LiquidGlass;
