/**
 * Replay resolution for ended livestreams.
 *
 * The backend records every stream, moves the finished file into DeHub's own
 * bucket and deletes the provider's copy — so a replay is a plain mp4 on the
 * CDN, not an HLS playlist, and it only exists once that capture reports
 * `ready`. The live ladder is dead the moment ingest stops, so an ended stream
 * with no replay has nothing to play at all.
 *
 * The web app mirrors this in `src/lib/live-replay.ts`. The two must agree:
 * they resolve the same streams for the same users.
 */

interface RecordingRecord {
  status?: string;
  url?: string;
  /** Set when the capture was cut down to the creator's daily allowance. */
  truncated?: boolean;
  durationSec?: number;
}

/**
 * Deliberately strict about `status`: a failed or skipped capture still writes
 * a recording object, and handing a card half a record would put a play button
 * over a URL that does not exist.
 */
export function extractReplayUrl(stream: unknown): string | undefined {
  const recording = (stream as { recording?: RecordingRecord } | null | undefined)?.recording;
  if (!recording || recording.status !== "ready") return undefined;
  return recording.url || undefined;
}

/**
 * Whether the stored replay is only the opening stretch of the broadcast —
 * the card labels it PARTIAL rather than presenting a cut as the whole show.
 */
export function isReplayTruncated(stream: unknown): boolean {
  const recording = (stream as { recording?: RecordingRecord } | null | undefined)?.recording;
  return recording?.status === "ready" && !!recording.truncated;
}

/** Length of the captured replay, when the capture recorded one. */
export function replayDurationSec(stream: unknown): number | undefined {
  const recording = (stream as { recording?: RecordingRecord } | null | undefined)?.recording;
  return recording?.status === "ready" ? recording.durationSec : undefined;
}
