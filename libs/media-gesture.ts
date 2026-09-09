/**
 * Maximum finger travel that still counts as a media tap.
 *
 * Feed videos and fullscreen shorts sit inside vertical scrollers. A release
 * after more travel than this belongs to the scroller, never play/pause or a
 * reaction gesture.
 */
export const MEDIA_TAP_SLOP_PX = 10;

export interface GesturePoint {
  x: number;
  y: number;
}

export function movedBeyondMediaTapSlop(
  start: GesturePoint,
  current: GesturePoint,
  slop = MEDIA_TAP_SLOP_PX,
): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > slop;
}
