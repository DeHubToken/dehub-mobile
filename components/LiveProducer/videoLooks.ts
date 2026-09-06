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
 * Both platforms register the same nine names now — Kotlin in
 * android/.../videolooks/VideoLooks.kt, Objective-C in ios/DeHub/DHBVideoLooks.m.
 */
export const videoLooksSupported =
  Platform.OS === "android" || Platform.OS === "ios";

/**
 * The chain to hand `track._setVideoEffects` for a look.
 *
 * "No look" is not the same thing on the two platforms. On Android an EMPTY
 * chain is fatal, not idle: react-native-webrtc's VideoEffectProcessor retains
 * every captured frame, and when no processor produces a replacement it hands
 * the original to the sink and releases it twice (videoEffects/
 * VideoEffectProcessor.java, onFrameCaptured). WebRTC's refcount guard throws
 * on the camera thread and the process dies — which is how the producer used
 * to close the instant its preview appeared, on every open, for anyone who had
 * never touched a look (v1.17.2, 2026-09-06). A null chain takes the other
 * branch of GetUserMediaImpl.setVideoEffects and removes the processor from
 * the source altogether, which is what "no look" means.
 *
 * iOS has no refcount to trip, marks the argument nonnull, and forwards frames
 * through an empty chain untouched, so it keeps the empty array.
 */
export function videoEffectChain(
  look: VideoLookId,
  os: string = Platform.OS,
): string[] | null {
  if (look && look !== "none") return [look];
  return os === "android" ? null : [];
}
