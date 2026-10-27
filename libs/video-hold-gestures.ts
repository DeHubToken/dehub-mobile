/**
 * Shared rules for the Shorts viewer's hold, double tap and drag-to-leave
 * gestures, kept pure so the screen and web's viewer agree and tests can pin
 * them. Mirrors web's src/lib/video-hold-gestures.ts.
 */

/** Hold on the left third = rewind, right third = fast forward, middle keeps its own hold. */
export type HoldSide = 'rewind' | 'forward' | 'centre';

export function holdSideAt(x: number, width: number): HoldSide {
  'worklet';
  if (x < width / 3) return 'rewind';
  if (x > (width * 2) / 3) return 'forward';
  return 'centre';
}

/** A double tap in the outer thirds jumps; the middle third keeps Like. */
export function seekSideAt(x: number, width: number): -1 | 0 | 1 {
  'worklet';
  if (x < width / 3) return -1;
  if (x > (width * 2) / 3) return 1;
  return 0;
}

export const SEEK_JUMP_SECONDS = 10;
export const HOLD_BASE_RATE = 2;
export const HOLD_MAX_RATE = 4;
/** Drag down this far during a hold and the speed stays after letting go. */
export const HOLD_LOCK_MIN = 24;
/** Every further step of drag adds half a speed step, up to HOLD_MAX_RATE. */
const HOLD_RATE_STEP = 40;
/** How often a rewind steps the clip back. */
export const REWIND_TICK_MS = 150;

export function heldRate(dragDown: number): { rate: number; locked: boolean } {
  'worklet';
  if (dragDown < HOLD_LOCK_MIN) return { rate: HOLD_BASE_RATE, locked: false };
  const steps = Math.floor((dragDown - HOLD_LOCK_MIN) / HOLD_RATE_STEP);
  return { rate: Math.min(HOLD_MAX_RATE, HOLD_BASE_RATE + steps * 0.5), locked: true };
}

/**
 * Whether letting go of a drag-to-leave (down, or in from the left edge)
 * finishes it. Past about a third of the way, or a quick fling, leaves; a fling
 * back the other way always cancels.
 */
export function commitsDismiss(distance: number, velocity: number, size: number): boolean {
  'worklet';
  if (velocity < -300) return false;
  return distance > size * 0.3 || (velocity > 800 && distance > 24);
}
