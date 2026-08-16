import { apiClient } from "../libs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordAnonViews } from "./anonView.service";

// Video view threshold: 10% of duration OR 3 seconds, whichever comes first
const VIDEO_MIN_WATCH_MS = 3000; // 3 seconds
const VIDEO_MIN_WATCH_PERCENT = 0.10; // 10%

// Post view threshold: 50% visible for 2 seconds
const POST_VISIBILITY_PERCENT = 0.5; // 50% of post must be visible
const POST_MIN_VIEW_TIME_MS = 2000; // 2 seconds

// Batch settings
const BATCH_MAX_SIZE = 50; // Max tokens per batch request
const BATCH_FLUSH_INTERVAL_MS = 5000; // Flush batch every 5 seconds
const BATCH_FLUSH_ON_COUNT = 20; // Flush when batch reaches this size

// Rate limiting (server enforces 30s per token, we track 24h for unique views)
const VIEW_COOLDOWN_PREFIX = "dhb_view_cooldowns";
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

// Active account for scoped cooldown storage
let activeViewAccount: string | null = null;

/** Set the active account for view cooldown scoping. Call on login/switch. */
export function setViewAccount(address: string | null): void {
  const prev = activeViewAccount;
  activeViewAccount = address ? address.toLowerCase() : null;
  // Reset in-memory state when account changes
  if (prev !== activeViewAccount) {
    viewCooldowns = {};
    cooldownsLoaded = false;
    recordedViews.clear();
  }
}

function viewCooldownKey(): string {
  return activeViewAccount
    ? `${VIEW_COOLDOWN_PREFIX}:${activeViewAccount}`
    : VIEW_COOLDOWN_PREFIX;
}

// In-memory guard to avoid duplicate submissions per session
const recordedViews = new Set<string>();

// Pending batch of token IDs to submit, split by which backend they belong to.
// A signed-in viewer's views go to the DeHub API, a signed-out viewer's to the
// anon-views edge function, and auth state can change between a view being
// queued and the batch flushing — so the destination is decided at queue time,
// not at flush time.
let pendingBatchTokenIds: Set<string> = new Set();
let pendingAnonBatchTokenIds: Set<string> = new Set();
let batchFlushTimer: ReturnType<typeof setTimeout> | null = null;

function totalPendingViews(): number {
  return pendingBatchTokenIds.size + pendingAnonBatchTokenIds.size;
}

// View cooldown cache (loaded from AsyncStorage)
let viewCooldowns: Record<string, number> = {};
let cooldownsLoaded = false;

export type TokenId = number | string;

export interface RecordViewOptions {
  tokenId: TokenId;
  positionMs: number; // current playback position in ms
  durationMs?: number | null; // total duration in ms (if known)
  account?: string | null; // wallet/account if available
  isSignedIn?: boolean; // explicit signed-in state (preferred)
}

export interface PostViewTrackingState {
  tokenId: TokenId;
  visibleStartTime: number | null; // timestamp when post became 50%+ visible
  hasRecordedView: boolean;
}

export interface BatchViewResponse {
  success: boolean;
  processed: number;
  newUniqueViews: number;
  rateLimited: number;
}

async function loadCooldowns(): Promise<void> {
  if (cooldownsLoaded) return;
  try {
    const stored = await AsyncStorage.getItem(viewCooldownKey());
    if (stored) {
      viewCooldowns = JSON.parse(stored);
      // Prune expired entries
      const now = Date.now();
      const pruned: Record<string, number> = {};
      for (const [key, expiry] of Object.entries(viewCooldowns)) {
        if (expiry > now) pruned[key] = expiry;
      }
      viewCooldowns = pruned;
    }
  } catch (e) {
    console.warn("[ViewService] Failed to load cooldowns", e);
    viewCooldowns = {};
  }
  cooldownsLoaded = true;
}

async function saveCooldowns(): Promise<void> {
  try {
    await AsyncStorage.setItem(viewCooldownKey(), JSON.stringify(viewCooldowns));
  } catch (e) {
    console.warn("[ViewService] Failed to save cooldowns", e);
  }
}

function isOnCooldown(tokenId: TokenId): boolean {
  const key = keyFor(tokenId);
  const expiry = viewCooldowns[key];
  if (!expiry) return false;
  return Date.now() < expiry;
}

function setCooldown(tokenId: TokenId): void {
  const key = keyFor(tokenId);
  viewCooldowns[key] = Date.now() + VIEW_COOLDOWN_MS;
  // Debounced save (don't await)
  saveCooldowns();
}

/**
 * Compute the minimum watch time threshold for counting a video view.
 * Matches web (view-tracker.ts): the LARGER of 10% of duration and 3 seconds.
 * Math.min here counted a 10s short as viewed after 1s while web needed 3s.
 */
export function computeVideoViewThresholdMs(durationMs?: number | null): number {
  if (!durationMs || durationMs <= 0) return VIDEO_MIN_WATCH_MS;
  const tenPercent = durationMs * VIDEO_MIN_WATCH_PERCENT;
  return Math.max(tenPercent, VIDEO_MIN_WATCH_MS);
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
 * Record a video view via GET /record-view/{tokenId} when eligibility is met.
 * - Only submits once per tokenId per app session (in-memory guard).
 * - Threshold: 10% of duration OR 3 seconds, whichever is first.
 * - Signed-out viewers count too: their views go to the `anon-views` edge
 *   function, since the DeHub API rejects unauthenticated view calls.
 *
 * Returns true if a view was submitted this call, false otherwise.
 */
export async function recordViewIfEligible(opts: RecordViewOptions): Promise<boolean> {
  const { tokenId, positionMs, durationMs } = opts;

  await loadCooldowns();

  const id = keyFor(tokenId);
  if (recordedViews.has(id)) return false;
  if (isOnCooldown(tokenId)) return false;

  const threshold = computeVideoViewThresholdMs(durationMs ?? undefined);
  // Allow a tiny epsilon to account for timing jitter
  const epsilon = 200;
  if (positionMs + epsilon < threshold) return false;

  const signedIn = hasAuth(opts);

  try {
    if (signedIn) {
      await apiClient.get(`/record-view/${encodeURIComponent(id)}`, { isAuthRequired: true });
    } else {
      const result = await recordAnonViews([id]);
      if (!result?.success) return false;
    }
    recordedViews.add(id);
    setCooldown(tokenId);
    return true;
  } catch (e) {
    console.error("[ViewService] recordView error", e);
    return false;
  }
}

/** Manually mark a tokenId as already recorded (e.g., after server confirm elsewhere). */
export function markViewRecorded(tokenId: TokenId): void {
  recordedViews.add(keyFor(tokenId));
  setCooldown(tokenId);
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

/**
 * Queue a post view for batch submission.
 * Called when a post has been 50%+ visible for 2+ seconds.
 * Signed-out viewers are queued too, and go to the anonymous view backend.
 */
export async function queuePostView(tokenId: TokenId, isSignedIn: boolean): Promise<void> {
  await loadCooldowns();

  const id = keyFor(tokenId);

  // Skip if already recorded this session or on cooldown
  if (recordedViews.has(id)) return;
  if (isOnCooldown(tokenId)) return;

  // Add to the pending batch for whichever backend this viewer belongs to
  if (isSignedIn) {
    pendingBatchTokenIds.add(id);
  } else {
    pendingAnonBatchTokenIds.add(id);
  }
  recordedViews.add(id); // Mark as recorded to prevent duplicates

  // Schedule flush if not already scheduled
  if (!batchFlushTimer) {
    batchFlushTimer = setTimeout(() => flushBatchViews(), BATCH_FLUSH_INTERVAL_MS);
  }

  // Flush immediately if batch is large enough
  if (totalPendingViews() >= BATCH_FLUSH_ON_COUNT) {
    flushBatchViews();
  }
}

/**
 * Flush pending batch views to the server.
 * Called automatically on timer or when batch reaches threshold.
 */
export async function flushBatchViews(): Promise<BatchViewResponse | null> {
  // Clear the timer
  if (batchFlushTimer) {
    clearTimeout(batchFlushTimer);
    batchFlushTimer = null;
  }
  
  // Get and clear pending batches
  const tokenIds = Array.from(pendingBatchTokenIds);
  const anonTokenIds = Array.from(pendingAnonBatchTokenIds);
  pendingBatchTokenIds.clear();
  pendingAnonBatchTokenIds.clear();

  if (tokenIds.length === 0 && anonTokenIds.length === 0) return null;

  const chunk_ = (ids: string[]): string[][] => {
    const out: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_MAX_SIZE) {
      out.push(ids.slice(i, i + BATCH_MAX_SIZE));
    }
    return out;
  };

  let totalProcessed = 0;
  let totalNewViews = 0;
  let totalRateLimited = 0;

  // Signed-out views → anon-views edge function
  for (const chunk of chunk_(anonTokenIds)) {
    const result = await recordAnonViews(chunk);
    if (result?.success) {
      totalProcessed += result.submitted || 0;
      totalNewViews += result.recorded || 0;
      totalRateLimited += (result.submitted || 0) - (result.recorded || 0);
      chunk.forEach(id => setCooldown(id));
    }
  }

  // Signed-in views → DeHub API
  for (const chunk of chunk_(tokenIds)) {
    try {
      const response = await apiClient.post<BatchViewResponse>(
        "/view/batch",
        { tokenIds: chunk.map(id => parseInt(id, 10) || id) },
        { isAuthRequired: true }
      );
      
      if (response) {
        totalProcessed += response.processed || 0;
        totalNewViews += response.newUniqueViews || 0;
        totalRateLimited += response.rateLimited || 0;
        
        // Set cooldowns for successfully processed views
        chunk.forEach(id => setCooldown(id));
      }
    } catch (e) {
      console.error("[ViewService] Batch view error", e);
      // Re-add failed tokens back to pending (except those that might be rate limited)
      // Don't re-add to avoid infinite retry loops - they'll be tried on next scroll
    }
  }
  
  return {
    success: true,
    processed: totalProcessed,
    newUniqueViews: totalNewViews,
    rateLimited: totalRateLimited,
  };
}

/**
 * Force flush batch views (e.g., when app goes to background or unmounts).
 */
export function forceFlushBatchViews(): void {
  if (totalPendingViews() > 0) {
    flushBatchViews().catch(console.error);
  }
}

/**
 * Creates a visibility tracker for a single post/feed item.
 * Call `onVisibilityChange` when the item's visibility changes.
 * The tracker will automatically queue a view when the post has been
 * 50%+ visible for 2+ seconds.
 */
export function createPostViewTracker(tokenId: TokenId, isSignedIn: boolean) {
  let visibleStartTime: number | null = null;
  let hasRecorded = false;
  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  
  const cleanup = () => {
    if (checkTimer) {
      clearTimeout(checkTimer);
      checkTimer = null;
    }
  };
  
  const checkAndRecord = () => {
    if (hasRecorded) return;
    if (!visibleStartTime) return;
    
    const elapsed = Date.now() - visibleStartTime;
    if (elapsed >= POST_MIN_VIEW_TIME_MS) {
      hasRecorded = true;
      queuePostView(tokenId, isSignedIn);
    }
  };
  
  return {
    /**
     * Call this when visibility changes.
     * @param visiblePercent - Fraction of the item visible (0-1)
     */
    onVisibilityChange(visiblePercent: number): void {
      if (hasRecorded) return;
      
      const isVisible = visiblePercent >= POST_VISIBILITY_PERCENT;
      
      if (isVisible && !visibleStartTime) {
        // Just became visible enough - start timer
        visibleStartTime = Date.now();
        cleanup();
        checkTimer = setTimeout(checkAndRecord, POST_MIN_VIEW_TIME_MS + 100);
      } else if (!isVisible && visibleStartTime) {
        // No longer visible enough - reset
        visibleStartTime = null;
        cleanup();
      }
    },
    
    /** Check if view has been recorded */
    hasRecorded(): boolean {
      return hasRecorded;
    },
    
    /** Cleanup timers (call on unmount) */
    cleanup,
  };
}

/** @deprecated Use computeVideoViewThresholdMs instead */
export const computeViewThresholdMs = computeVideoViewThresholdMs;
