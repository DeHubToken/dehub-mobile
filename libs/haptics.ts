import * as Haptics from "expo-haptics";

/**
 * Tactile feedback for the moments that should feel physical: a reaction, a
 * send, a completed payment. Never awaited and never allowed to throw — a
 * device without a vibrator (or with it turned off) just gets nothing.
 */
const fire = (run: () => Promise<void>) => {
  try {
    run().catch(() => {});
  } catch {}
};

export const haptic = {
  /** Light tick: taps that change state (like, react, send). */
  tap: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Firmer bump: long-press trays, primary actions like Post. */
  press: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Crossing a threshold, e.g. swipe-to-reply arming. */
  select: () => fire(() => Haptics.selectionAsync()),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
