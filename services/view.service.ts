import { apiClient } from "../libs";

// In-memory guard to avoid duplicate submissions per session
const recordedViews = new Set<string>();

export type TokenId = number | string;

export interface RecordViewOptions {
  tokenId: TokenId;
  positionMs: number; // current playback position in ms
  durationMs?: number | null; // total duration in ms (if known)
  account?: string | null; // wallet/account if available
  isSignedIn?: boolean; // explicit signed-in state (preferred)
}

/**
 * Compute the minimum watch time threshold for counting a view.
 * If duration >= 5s, require 5s watched; otherwise require full duration.
 */
export function computeViewThresholdMs(durationMs?: number | null): number {
  const FIVE_SECONDS = 5000;
  if (!durationMs || durationMs <= 0) return FIVE_SECONDS;
  return durationMs >= FIVE_SECONDS ? FIVE_SECONDS : durationMs;
}

/** Determines if the user is authenticated enough to record a view. */
function hasAuth(opts: RecordViewOptions): boolean {
  if (typeof opts.isSignedIn === "boolean") return opts.isSignedIn;
  return !!opts.account; // fallback: consider presence of account as signed-in
}

/** Normalize tokenId to a stable string key. */
function keyFor(tokenId: TokenId): string {
  return String(tokenId);
}

/**
 * Record a view via GET /record-view/{tokenId} when eligibility is met.
 * - Only submits once per tokenId per app session (in-memory guard).
 * - Requires signed-in state (auth token will be attached by apiClient).
 * - Threshold: min(5s, durationMs) must be watched; if duration unknown, assume 5s.
 *
 * Returns true if a view was submitted this call, false otherwise.
 */
export async function recordViewIfEligible(opts: RecordViewOptions): Promise<boolean> {
  const { tokenId, positionMs, durationMs } = opts;
  if (!hasAuth(opts)) return false;
  const id = keyFor(tokenId);
  if (recordedViews.has(id)) return false;

  const threshold = computeViewThresholdMs(durationMs ?? undefined);
  // Allow a tiny epsilon to account for timing jitter
  const epsilon = 200;
  if (positionMs + epsilon < threshold) return false;

  try {
    await apiClient.get(`/record-view/${encodeURIComponent(id)}`, { isAuthRequired: true });
    recordedViews.add(id);
    return true;
  } catch (e) {
    console.error("[ViewService] recordView error", e);
    return false;
  }
}

/** Manually mark a tokenId as already recorded (e.g., after server confirm elsewhere). */
export function markViewRecorded(tokenId: TokenId): void {
  recordedViews.add(keyFor(tokenId));
}

/** Reset the in-memory guard (useful for tests). */
export function resetRecordedViews(): void {
  recordedViews.clear();
}

/**
 * Helper that returns a lightweight recorder to call from onProgress.
 * Usage:
 *   const rec = createViewRecorder({ tokenId, isSignedIn, account });
 *   onProgress={(pos, dur) => rec.onProgress(pos, dur)}
 */
export function createViewRecorder(base: Pick<RecordViewOptions, "tokenId" | "isSignedIn" | "account">) {
  let done = false;
  return {
    async onProgress(positionMs: number, durationMs?: number | null) {
      if (done) return false;
      const recorded = await recordViewIfEligible({ ...base, positionMs, durationMs });
      if (recorded) done = true;
      return recorded;
    },
    hasRecorded() { return done; },
  };
}
