import React, { useSyncExternalStore } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import IosGlassPill from "./IosGlassPill";
import { androidFrostSupported, useFrostedSource } from "./FrostedBackdrop";
import { useFeedSurfaceActive } from "../../libs/visualActivity";
import { useAppTheme } from "../../context/ThemeContext";
import { KeepDarkScope } from "../../libs/jsx/tone";
import { isFeedScrolling, subscribeFeedScrollStart, subscribeFeedSettled } from "../../libs/scrollActivity";

// The blur stops while the feed moves and comes back when it settles; it
// fades between the two so the pill never snaps from plain to frosted.
const BLUR_IN = FadeIn.duration(260);
const BLUR_OUT = FadeOut.duration(220);

function FadingBlur({ children }: { children: React.ReactNode }) {
  return (
    <Animated.View entering={BLUR_IN} exiting={BLUR_OUT} pointerEvents="none" style={StyleSheet.absoluteFill}>
      {children}
    </Animated.View>
  );
}

const androidScrollSnapshot = () => Platform.OS === "android" && isFeedScrolling();
const subscribeAndroidScroll = (notify: () => void) => {
  if (Platform.OS !== "android") return () => {};
  const start = subscribeFeedScrollStart(notify);
  const settle = subscribeFeedSettled(notify);
  return () => { start(); settle(); };
};

/**
 * System Light's pill depth, as on web (system-light.css "Top bar v2"): a soft
 * layered drop shadow. Goes on the pill's clipping container, outside the
 * material. The material itself draws the pale frost and its hairline rim.
 */
export const LIGHT_PILL_SHADOW = {
  boxShadow: "0px 1px 1px rgba(11,11,13,0.03), 0px 6px 16px -4px rgba(11,11,13,0.08), 0px 18px 36px -12px rgba(11,11,13,0.10)",
} as const;

/** Shared pill material. Geometry and controls belong to the existing caller.
 *  `live` samples the feed through a real blur. Only drawers ask for it: a
 *  live blur on always-visible chrome (top tab pill, bottom bar) makes every
 *  change inside the feed (a playing video, a live ring) repaint and re-blur
 *  the whole window, which held Android scrolling at ~60 fps on a 120 Hz
 *  screen and kept idle pages drawing ~70 frames a second. */
export default function FrostedPill({ tint, borderRadius, bordered = true, live = false }: { tint: string; borderRadius: number; bordered?: boolean; live?: boolean }) {
  const target = useFrostedSource();
  const surfaceActive = useFeedSurfaceActive();
  const { isLight } = useAppTheme();
  const scrolling = useSyncExternalStore(subscribeAndroidScroll, androidScrollSnapshot, androidScrollSnapshot);
  if (Platform.OS === "ios") return <IosGlassPill tint={tint} borderRadius={borderRadius} bordered={bordered} />;
  // Opacity on a covered page does not stop native blur target sampling.
  // Each Android blur consumer redraws the full feed-sized target. Keep the
  // existing material while it moves; resume sampling only after it settles.
  const blur = live && androidFrostSupported && !!target && surfaceActive && !scrolling;
  if (isLight) {
    // Written in light colours on purpose and kept out of the colour pass: the
    // dark material turned around came out grey, with its top highlight
    // flipped into a dark band and a heavy grey rim. This is web's pale frost.
    return (
      <KeepDarkScope>
        <View collapsable={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}>
          {/* Solid underneath either way, so the blur fades over it. */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "#F4F4F7" }]} />
          {blur ? (
            <FadingBlur>
              <BlurView
                blurTarget={target}
                blurMethod="dimezisBlurViewSdk31Plus"
                intensity={65}
                tint="light"
                style={StyleSheet.absoluteFill}
              />
            </FadingBlur>
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(244,244,247,0.78)" }]} />
          <View style={[StyleSheet.absoluteFill, { borderRadius, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(11,11,13,0.08)", borderTopColor: "rgba(255,255,255,0.9)" }]} />
        </View>
      </KeepDarkScope>
    );
  }
  return (
    // Keep the stationary material as its own native view when tab controls move.
    <View collapsable={false} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: "hidden" }]}>
      {/* BlurTargetView can deliver a frame after its source changes on a tab
          switch. Keep the same fallback painted beneath it during that gap. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "#18181B" }]} />
      {blur ? (
        <FadingBlur>
          <BlurView
            blurTarget={target}
            blurMethod="dimezisBlurViewSdk31Plus"
            intensity={65}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        </FadingBlur>
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />
      <LinearGradient
        colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.025)", "rgba(255,255,255,0)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {bordered && <View style={[StyleSheet.absoluteFill, { borderRadius, borderWidth: StyleSheet.hairlineWidth * 2,
        borderColor: "rgba(255,255,255,0.22)", borderTopColor: "rgba(255,255,255,0.4)" }]} />}
    </View>
  );
}
