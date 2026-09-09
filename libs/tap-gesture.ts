/**
 * Shared timing for the double-like / triple-love gesture.
 *
 * Production Chrome delivers a deliberate click cadence around 300ms, and
 * accessibility touch timing can be slightly slower. Anything below 360ms is
 * one gesture; feedback still paints on tap two, before this window resolves.
 */
export const TAP_GESTURE_WINDOW_MS = 360;
export const TAP_REACTION_RESOLUTION_MS = 360;

// The glyph must survive the first video-compositor frame and remain readable
// over motion. Starting it visible (see ShortsViewerScreen) plus this lifetime
// prevents the acknowledgement collapsing into a single missed frame.
export const TAP_LIKE_ANIMATION_MS = 900;
export const TAP_LOVE_ANIMATION_MS = 1100;

export function continuesTapGesture(previousTapAt: number, now: number): boolean {
  return previousTapAt > 0 && now - previousTapAt < TAP_GESTURE_WINDOW_MS;
}
