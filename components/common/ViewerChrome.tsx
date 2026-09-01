/**
 * The chrome shared by every fullscreen viewer — shorts, and the live stream.
 *
 * These numbers were derived once, in ShortsViewerScreen, from web's viewer:
 * one 16px frame margin, `w-10 h-10 rounded-xl` buttons filled with
 * `bg-zinc-900/60 backdrop-blur-sm`, `gap-3` between them, bare icons over a
 * scrim on the action row. They live here rather than in that screen because
 * the live viewer had grown its own set — black/50 circles, hairline borders,
 * emoji headings — and two viewers of the same app looked like two apps.
 *
 * Anything drawn over a video in this app should pull from this file. If a
 * value needs to change, it changes here and both surfaces move together.
 */
import React from "react";
import { View, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";

export const ICON_COLOR = "#fff";
/** Web's `text-white/70` on every count under an action row. */
export const COUNT_COLOR = "rgba(255,255,255,0.7)";

/** One margin for the whole frame — web hangs all viewer chrome off `4`. */
export const EDGE = 16;
/** Web `gap-3` between chrome buttons. */
export const CHROME_GAP = 12;
/** Web `w-10 h-10` / `rounded-xl` on every chrome button. */
export const CHROME_SIZE = 40;
export const CHROME_RADIUS = 12;
/** Web `bg-zinc-900/60 backdrop-blur-sm`, and nothing else — no hairline. */
export const CHROME_FILL = "rgba(24,24,27,0.6)";
/**
 * Takes the 40pt buttons past the 44pt tap minimum. The horizontal half is
 * exactly CHROME_GAP / 2, so neighbours in a group meet at the midpoint of the
 * gap instead of overlapping and stealing each other's taps.
 */
export const CHROME_HIT_SLOP = {
  top: 6,
  bottom: 6,
  left: CHROME_GAP / 2,
  right: CHROME_GAP / 2,
};

/**
 * Web leans on `drop-shadow-lg` to keep white overlay text legible over an
 * arbitrary video frame. RN has no filter, so the same job is done with a
 * text shadow on the type and a scrim behind it.
 */
export const TEXT_SHADOW = {
  textShadowColor: "rgba(0,0,0,0.55)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 4,
} as const;

/**
 * The glass behind a chrome button, as an absolutely-positioned sibling rather
 * than a wrapper, so `pointerEvents="none"` lets taps on the button's own
 * padding still reach the video underneath.
 *
 * The Android backdrop blur is deliberately absent. `dimezisBlurView`
 * re-snapshots the root view every frame and throws when a list mutates its
 * children mid-draw, so it is only safe on surfaces that mount and unmount
 * (see components/ui/LiquidGlass.tsx) — never on chrome pinned over a video
 * feed that is recycling cells. The 60% fill carries the contrast on its own.
 */
export const ChromeFill: React.FC<{ radius?: number }> = ({ radius }) => (
  <View
    pointerEvents="none"
    style={[
      StyleSheet.absoluteFill,
      styles.fill,
      radius === undefined ? null : { borderRadius: radius },
    ]}
  >
    {Platform.OS === "ios" && (
      <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
    )}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: CHROME_FILL }]} />
  </View>
);

const styles = StyleSheet.create({
  fill: {
    overflow: "hidden",
    borderRadius: CHROME_RADIUS,
  },
});
