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
import { View, StyleSheet } from "react-native";

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
/**
 * Web is `bg-zinc-900/60 backdrop-blur-sm`; this is the same zinc-900 at full
 * opacity, because there is no blur here to carry the contrast. No hairline.
 */
export const CHROME_FILL = "#18181B";
/**
 * The same fill, most of the way out.
 *
 * On a stream the opaque zinc put every icon on its own little slab and the
 * head of the frame read as a row of cards laid on the broadcast. At 20% the
 * shape is still there — it still groups the icon and still says 'control' —
 * but the picture reads straight through it. The scrim and TEXT_SHADOW carry
 * the contrast the fill used to.
 *
 * Shorts keeps the opaque one: its chrome sits over a 9:16 video that fills
 * the frame edge to edge, where there is no scrim to lean on.
 */
export const CHROME_FILL_SHEER = "rgba(0,0,0,0.20)";
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
 * The fill is opaque, and there is no blur on either platform. Android never
 * had one — expo-blur paints a flat tint there rather than sampling anything —
 * so these icons sat on a bare 60% fill and the video read through them. And
 * turning on the real Android blur is not an option: `dimezisBlurView`
 * re-snapshots the root view every frame and throws when a list mutates its
 * children mid-draw, which is fatal on chrome pinned over a recycling feed.
 */
export const ChromeFill: React.FC<{ radius?: number; sheer?: boolean }> = ({
  radius,
  sheer,
}) => (
  <View
    pointerEvents="none"
    style={[
      StyleSheet.absoluteFill,
      styles.fill,
      radius === undefined ? null : { borderRadius: radius },
    ]}
  >
    <View
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: sheer ? CHROME_FILL_SHEER : CHROME_FILL },
      ]}
    />
  </View>
);

const styles = StyleSheet.create({
  fill: {
    overflow: "hidden",
    borderRadius: CHROME_RADIUS,
  },
});
