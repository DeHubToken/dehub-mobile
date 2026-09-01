import { Platform } from "react-native";

/**
 * Camera looks for the live producer.
 *
 * These ids are a contract with the native side: each one must match a name
 * registered in `ProcessorProvider` (android/.../videolooks/VideoLooks.kt).
 * react-native-webrtc resolves a look by name at capture time and quietly drops
 * anything it cannot find, so a typo here is a silent no-op, not an error.
 *
 * The set is deliberately smaller than the web app's twelve. Everything native
 * works on the YUV planes without convolving, so the web's Soft bloom, Dream
 * and Blur — all of which need a real blur over the luma plane — are not here.
 * Soft is a tone curve on this platform, and Pixelate is the privacy look.
 *
 * Names live in i18n under `videoLooks.<id>`, shared with the web wording.
 */

export type VideoLookId =
  | "none"
  | "soft"
  | "mono"
  | "noir"
  | "warm"
  | "cool"
  | "vivid"
  | "neon"
  | "vhs"
  | "pixelate";

export interface VideoLook {
  id: VideoLookId;
  emoji: string;
}

export const VIDEO_LOOKS: VideoLook[] = [
  { id: "none", emoji: "🚫" },
  { id: "soft", emoji: "✨" },
  { id: "mono", emoji: "⚫" },
  { id: "noir", emoji: "🎞️" },
  { id: "warm", emoji: "🌇" },
  { id: "cool", emoji: "🧊" },
  { id: "vivid", emoji: "🌈" },
  { id: "neon", emoji: "🌃" },
  { id: "vhs", emoji: "📼" },
  { id: "pixelate", emoji: "🟪" },
];

/**
 * Whether this build can actually apply a look.
 *
 * A platform check rather than a feature test, because there is nothing to
 * test: `_setVideoEffects` exists on every track regardless of whether any
 * processor is registered behind it, so asking the track would always say yes.
 * The iOS processors are not written yet; when they are, this becomes true
 * there and nothing else changes.
 */
export const videoLooksSupported = Platform.OS === "android";
