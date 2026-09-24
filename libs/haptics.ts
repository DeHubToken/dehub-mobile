import { optionalNativePackage } from "./optionalNative";

// Resolved lazily and optionally: see optionalNative.ts. An older APK without
// ExpoHaptics gets no vibration instead of a crash.
const Haptics = optionalNativePackage(
  "ExpoHaptics",
  () => require("expo-haptics") as typeof import("expo-haptics"),
);

/**
 * Tactile feedback for the moments that should feel physical: a reaction, a
 * send, a completed payment. Never awaited and never allowed to throw — a
 * device without a vibrator (or with it turned off) just gets nothing.
 */
const fire = (run: (h: NonNullable<typeof Haptics>) => Promise<void>) => {
  if (!Haptics) return;
  try {
    run(Haptics).catch(() => {});
  } catch {}
};

export const haptic = {
  /** Light tick: taps that change state (like, react, send). */
  tap: () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Light)),
  /** Firmer bump: long-press trays, primary actions like Post. */
  press: () => fire((h) => h.impactAsync(h.ImpactFeedbackStyle.Medium)),
  /** Crossing a threshold, e.g. swipe-to-reply arming. */
  select: () => fire((h) => h.selectionAsync()),
  success: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Success)),
  error: () => fire((h) => h.notificationAsync(h.NotificationFeedbackType.Error)),
};
