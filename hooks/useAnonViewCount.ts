import { useEffect, useState } from "react";
import { fetchAnonViewCounts } from "../services/anonView.service";

/**
 * Anonymous view count merging
 * ============================
 * Views from signed-out users are recorded by the `anon-views` edge function,
 * not by the DeHub API, so a post's real total is the DeHub count plus the
 * anonymous count. Feed responses know nothing about the anonymous half, so it
 * is fetched here and added at display time. The same edge function backs the web
 * app, so both clients show the same total.
 *
 * Requests are coalesced: every card that mounts registers its token id, and ids
 * arriving within BATCH_WINDOW_MS go out as one request. Counts are cached for
 * CACHE_TTL_MS so scrolling back over a post does not refetch.
 */

const BATCH_WINDOW_MS = 150;
const CACHE_TTL_MS = 60_000;
const MAX_IDS_PER_REQUEST = 50; // Matches the edge function's cap.

// Token ids are numeric strings in the DeHub API; anything else is not a post.
const TOKEN_ID_PATTERN = /^\d{1,20}$/;

interface CacheEntry {
  count: number;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const subscribers = new Map<string, Set<(count: number) => void>>();
const pending = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function notify(tokenId: string, count: number): void {
  const listeners = subscribers.get(tokenId);
  if (!listeners) return;
  for (const listener of listeners) listener(count);
}

async function flushPending(): Promise<void> {
  batchTimer = null;
  if (pending.size === 0) return;

  const ids = Array.from(pending).slice(0, MAX_IDS_PER_REQUEST);
  for (const id of ids) pending.delete(id);

  const counts = await fetchAnonViewCounts(ids);
  const now = Date.now();

  for (const id of ids) {
    // Absent from the response means zero anonymous views, which is still worth
    // caching — otherwise every unviewed post refetches on each mount.
    const count = counts[id] ?? 0;
    cache.set(id, { count, fetchedAt: now });
    notify(id, count);
  }

  // More ids than one request could carry: keep draining.
  if (pending.size > 0) scheduleFlush();
}

function scheduleFlush(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    void flushPending();
  }, BATCH_WINDOW_MS);
}

/**
 * The anonymous view count for a post, or 0 until it is known. Safe to call with
 * a missing or non-numeric id (returns 0 and issues no request).
 */
export function useAnonViewCount(tokenId?: string | number | null): number {
  const id = tokenId === undefined || tokenId === null ? "" : String(tokenId);
  const valid = TOKEN_ID_PATTERN.test(id);

  const [count, setCount] = useState(() => cache.get(id)?.count ?? 0);

  useEffect(() => {
    if (!valid) {
      setCount(0);
      return;
    }

    const cached = cache.get(id);
    if (cached) {
      setCount(cached.count);
      if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) return;
    }

    let active = true;
    const listener = (value: number) => {
      if (active) setCount(value);
    };

    let listeners = subscribers.get(id);
    if (!listeners) {
      listeners = new Set();
      subscribers.set(id, listeners);
    }
    listeners.add(listener);

    pending.add(id);
    scheduleFlush();

    return () => {
      active = false;
      listeners!.delete(listener);
      if (listeners!.size === 0) subscribers.delete(id);
    };
  }, [id, valid]);

  return valid ? count : 0;
}

/**
 * A post's total view count with the anonymous half folded in. Mobile carries raw
 * numeric counts all the way to render, so unlike the web app this needs no
 * parsing and the total is exact.
 */
export function useMergedViewCount(
  tokenId?: string | number | null,
  baseViews?: number | null,
): number {
  const anonCount = useAnonViewCount(tokenId);
  return (baseViews || 0) + anonCount;
}
