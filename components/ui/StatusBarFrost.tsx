import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "../../context/ThemeContext";

/** How far below the status bar the frost fades out, so it has no hard edge. */
const FADE = 10;
/** How far the top bar slides before the band is fully in. */
const SHOW_OVER = 24;

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return `rgba(1,3,5,${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * A frosted band under the phone's status bar.
 *
 * The feed is edge to edge and the top bar slides away on a scroll down, so
 * the logo, the bell and the posts all passed right under the clock and
 * notification icons, where they read as clutter crawling over the system
 * bar. This sits above the header and blurs whatever goes under it, fading
 * out just below the bar.
 *
 * It shows only while the top bar is away, and stays for as long as it is,
 * scrolling or not. The bar coming back is what takes it away. It used to
 * swap to a sampled blur whenever the feed settled on Android, which read as
 * the band vanishing the moment a scroll stopped, so Android now keeps the
 * same theme tint the whole time; iOS keeps the system material.
 */
export default function StatusBarFrost({ headerY }: { headerY: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const { colors, isLight } = useAppTheme();
  const shownStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-headerY.value, [0, SHOW_OVER], [0, 1], "clamp"),
  }));
  if (!insets.top) return null;

  const base = typeof colors.background === "string" ? colors.background : isLight ? "#ffffff" : "#010305";
  const tint = hexToRgba(base, Platform.OS === "ios" ? 0.55 : 0.9);

  // Home is laid out below the status bar (App's SafeAreaView pads the top
  // edge), so the band starts one status bar above the screen. At top: 0 it
  // sat over the logo row instead and washed out the menu, logo and bell.
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { top: -insets.top, height: insets.top + FADE }, shownStyle]}>
      <View style={{ height: insets.top, overflow: "hidden" }}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={40} tint={isLight ? "light" : "dark"} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      </View>
      <LinearGradient colors={[tint, hexToRgba(base, 0)]} style={{ height: FADE }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Above the header (10) and the feed menu, below modals.
    zIndex: 30,
    elevation: 30,
  },
});
