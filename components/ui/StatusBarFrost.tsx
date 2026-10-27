import React, { useSyncExternalStore } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { androidFrostSupported, useFrostedSource } from "./FrostedBackdrop";
import { useAppTheme } from "../../context/ThemeContext";
import { useFeedSurfaceActive } from "../../libs/visualActivity";
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from "../../libs/scrollActivity";

/** How far below the status bar the frost fades out, so it has no hard edge. */
const FADE = 10;

const scrollSnapshot = () => Platform.OS === "android" && isFeedScrolling();
const subscribeScroll = (notify: () => void) => {
  if (Platform.OS !== "android") return () => {};
  const start = subscribeFeedScrollStart(notify);
  const settle = subscribeFeedSettled(notify);
  return () => { start(); settle(); };
};

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
 * The blur follows the same rules as the pills: Android 12+ samples the feed
 * only while it is still (sampling every frame of a scroll is the expensive
 * part), iOS uses the system material. Underneath it is always a tint in the
 * theme's colour, so while the blur is paused nothing shows through sharp.
 */
export default function StatusBarFrost() {
  const insets = useSafeAreaInsets();
  const { colors, isLight } = useAppTheme();
  const target = useFrostedSource();
  const surfaceActive = useFeedSurfaceActive();
  const scrolling = useSyncExternalStore(subscribeScroll, scrollSnapshot, scrollSnapshot);
  if (!insets.top) return null;

  const base = typeof colors.background === "string" ? colors.background : isLight ? "#ffffff" : "#010305";
  const blurAndroid = androidFrostSupported && !!target && surfaceActive && !scrolling;
  const tint = hexToRgba(base, Platform.OS === "ios" || blurAndroid ? 0.55 : 0.9);

  // Home is laid out below the status bar (App's SafeAreaView pads the top
  // edge), so the band starts one status bar above the screen. At top: 0 it
  // sat over the logo row instead and washed out the menu, logo and bell.
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: -insets.top, height: insets.top + FADE }]}>
      <View style={{ height: insets.top, overflow: "hidden" }}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={40} tint={isLight ? "light" : "dark"} style={StyleSheet.absoluteFill} />
        ) : blurAndroid ? (
          <BlurView
            blurTarget={target}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={60}
            tint={isLight ? "light" : "dark"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      </View>
      <LinearGradient colors={[tint, hexToRgba(base, 0)]} style={{ height: FADE }} />
    </View>
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
