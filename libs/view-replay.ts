/**
 * Whether a jump back to the start of a video counts as a new watch.
 *
 * Its own module, free of imports, because services/view.service reaches
 * Supabase at load time and this judgement is worth testing on its own.
 *
 * The judgement is not obvious. A loop wrap, a deliberate restart and a drag of
 * the scrubber to the left edge all arrive as the same thing: position is
 * suddenly near zero. Counting all three is how a six-second clip left looping
 * in the feed recorded ten views a minute from one viewer.
 */

/** Below this, nothing that happened counts as a watch. */
export const VIDEO_MIN_WATCH_MS = 3000;

/**
 * How close to the end a watch must have reached for a jump to zero to read as
 * a replay rather than a scrub. Generous, because the last progress tick before
 * a wrap rarely lands exactly on the duration.
 */
export const REPLAY_WRAP_TOLERANCE_MS = 1500;

/**
 * Floor between two counted views of the same post from one recorder.
 *
 * Matches the API's per-viewer-per-post rate limit, so a looping short clip
 * stops submitting what the server would reject anyway.
 */
export const MIN_MS_BETWEEN_VIEWS = 30_000;

export interface ReplayWrapInput {
  /** Where playback is now. */
  positionMs: number;
  /** Where it was on the previous tick. */
  lastPositionMs: number;
  /** Clip length, when the player knows it. */
  durationMs?: number | null;
  /** How long ago this recorder last counted a view. */
  msSinceLastView: number;
}

export function isReplayWrap({
  positionMs,
  lastPositionMs,
  durationMs,
  msSinceLastView,
}: ReplayWrapInput): boolean {
  // Not a jump to the start at all.
  if (positionMs >= 1000) return false;
  // Nothing worth calling a watch preceded it.
  if (lastPositionMs <= VIDEO_MIN_WATCH_MS) return false;
  // A replay wraps from the end. A scrub to zero comes from wherever the
  // viewer happened to be, and that is the case this rejects. A duration of 0
  // means the player has not resolved the length yet — treat it as unknown,
  // not as "every position is past the end".
  if (typeof durationMs === "number" && durationMs > 0) {
    if (lastPositionMs < durationMs - REPLAY_WRAP_TOLERANCE_MS) return false;
  }
  return msSinceLastView >= MIN_MS_BETWEEN_VIEWS;
}
