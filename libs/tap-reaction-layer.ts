/**
 * The like / love you get from double and triple tapping a post's media is
 * drawn on one layer at the root of the app (TapReactionLayer), not inside the
 * media it was tapped on. Drawn in place it was cut by the video box's rounded
 * edge and covered by the player's own top bar and buttons; from the root it
 * floats over all of them, and a little past the card's edge.
 *
 * Positions are window coordinates (`pageX` / `pageY` of the tap).
 */
export type TapBurstReaction = "like" | "love";

export interface TapBurst {
  reaction: TapBurstReaction;
  x: number;
  y: number;
}

type Listener = (burst: TapBurst) => void;
const listeners = new Set<Listener>();

export function subscribeTapBursts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** False when no layer is mounted, so the caller can draw its own fallback. */
export function showTapBurst(reaction: TapBurstReaction, x: number, y: number): boolean {
  if (!listeners.size || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  listeners.forEach((listener) => listener({ reaction, x, y }));
  return true;
}
