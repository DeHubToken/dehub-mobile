import { useState, useCallback, useEffect, useRef } from "react";
import {
  createPoll,
  getPolls,
  POLL_BATCH_LIMIT,
  voteOnPoll,
  removePollVote,
  closePoll,
  type CreatePollParams,
} from "../services/polls.service";
import type { DmPoll } from "../services/dm/dm.types";
import { toastError, toastSuccess } from "../libs/toast";
import { storage } from "../libs/storage";

// Feed cards mount and unmount constantly while scrolling, and every card asks
// whether its post has a poll — the feed payload does not say. That used to be
// one GET /poll/<id> per card. A page is 10-20 cards against a global throttle
// of 20 requests per 10 seconds, so scrolling spent the entire budget on posts
// that turned out to have no poll, and the requests the reader actually cared
// about — the feed refresh, a comment thread — were rejected with 429 behind
// them. Measured on a real device: 33 consecutive 429s in 11 seconds, all polls.
//
// So: every card that mounts in the same tick is asked about together, in one
// GET /polls?tokenIds=..., and the answers are cached.
//
// A poll can only be attached at post-creation time (there is no "add a poll to
// an existing post" flow), so "this post has no poll" is permanent and worth
// keeping across launches — after the first pass over a feed a returning reader
// asks about nothing at all. Only real polls, which gain votes over time, are
// re-fetched on a TTL.
const POLL_CACHE_TTL = 5 * 60 * 1000;

// One frame is enough to collect a screenful. Long enough that a page of cards
// mounting together lands in one request, short enough that nobody watches a
// poll appear late.
const BATCH_WINDOW_MS = 50;

// After a failed batch, wait before sending another. A failure is usually the
// rate limiter, and retrying into it immediately is what made a bad moment last.
const FAILURE_BACKOFF_MS = 10_000;

const NO_POLL_KEY = "dehub-posts-without-polls";
// The negative set only grows, so it is capped and trimmed oldest-first. 4000
// ids is far more than anyone scrolls in a session and costs a few tens of KB.
const NO_POLL_LIMIT = 4000;

const pollCache = new Map<number, { data: DmPoll | null; ts: number }>();

/** Ids known to have no poll, restored from disk on first use. */
let noPollIds: number[] | null = null;
let noPollSet: Set<number> | null = null;

function knownEmpty(): Set<number> {
  if (noPollSet) return noPollSet;
  try {
    const raw = storage.getString(NO_POLL_KEY);
    noPollIds = raw ? (JSON.parse(raw) as number[]) : [];
    if (!Array.isArray(noPollIds)) noPollIds = [];
  } catch {
    noPollIds = [];
  }
  noPollSet = new Set(noPollIds);
  return noPollSet;
}

function rememberEmpty(ids: number[]) {
  const set = knownEmpty();
  const added = ids.filter((id) => !set.has(id));
  if (added.length === 0) return;
  for (const id of added) set.add(id);
  noPollIds = [...(noPollIds ?? []), ...added];
  if (noPollIds.length > NO_POLL_LIMIT) {
    noPollIds = noPollIds.slice(noPollIds.length - NO_POLL_LIMIT);
    noPollSet = new Set(noPollIds);
  }
  try {
    storage.set(NO_POLL_KEY, JSON.stringify(noPollIds));
  } catch {
    // A full or unwritable store only costs us the cross-launch shortcut.
  }
}

function forgetEmpty(tokenId: number) {
  const set = knownEmpty();
  if (!set.has(tokenId)) return;
  set.delete(tokenId);
  noPollIds = (noPollIds ?? []).filter((id) => id !== tokenId);
  try {
    storage.set(NO_POLL_KEY, JSON.stringify(noPollIds));
  } catch {
    // See above.
  }
}

function isCacheFresh(cached: { data: DmPoll | null; ts: number }): boolean {
  return cached.data === null || Date.now() - cached.ts < POLL_CACHE_TTL;
}

// Ids waiting for the next flush, and everyone waiting on each of them.
const queued = new Map<number, Array<(poll: DmPoll | null) => void>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let backoffUntil = 0;

function settle(tokenId: number, data: DmPoll | null, cache: boolean) {
  if (cache) pollCache.set(tokenId, { data, ts: Date.now() });
  const waiters = queued.get(tokenId);
  queued.delete(tokenId);
  waiters?.forEach((resolve) => resolve(data));
}

async function flush() {
  flushTimer = null;
  const ids = [...queued.keys()].slice(0, POLL_BATCH_LIMIT);
  if (ids.length === 0) return;

  try {
    const res = await getPolls(ids);
    const found = res?.status ? res.result ?? {} : {};
    const empties: number[] = [];
    for (const id of ids) {
      const poll = (found as Record<string, DmPoll>)[String(id)] ?? null;
      if (poll === null) empties.push(id);
      settle(id, poll, true);
    }
    // The server answered: these posts have no poll, and never will.
    rememberEmpty(empties);
  } catch {
    // Transient — a 429, a dropped socket, a timeout. Resolve so no card hangs
    // on a spinner, but do NOT cache: writing `null` here would record "this
    // post has no poll" forever on the strength of a rate limit, and the poll
    // would stay invisible for the rest of the session.
    backoffUntil = Date.now() + FAILURE_BACKOFF_MS;
    for (const id of ids) settle(id, null, false);
  }

  // Anything that arrived while the request was in flight, or was cut by the
  // batch cap, goes in the next one.
  if (queued.size > 0) scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) return;
  const wait = Math.max(BATCH_WINDOW_MS, backoffUntil - Date.now());
  flushTimer = setTimeout(flush, wait);
}

function fetchPollCached(tokenId: number, force = false): Promise<DmPoll | null> {
  if (!force) {
    if (knownEmpty().has(tokenId)) return Promise.resolve(null);
    const cached = pollCache.get(tokenId);
    if (cached && isCacheFresh(cached)) {
      return Promise.resolve(cached.data);
    }
  } else {
    forgetEmpty(tokenId);
  }
  return new Promise<DmPoll | null>((resolve) => {
    const waiters = queued.get(tokenId);
    if (waiters) {
      waiters.push(resolve);
    } else {
      queued.set(tokenId, [resolve]);
    }
    scheduleFlush();
  });
}

export function invalidatePoll(tokenId: number) {
  pollCache.delete(tokenId);
  forgetEmpty(tokenId);
}

export function usePoll(tokenId: number | null) {
  const [poll, setPoll] = useState<DmPoll | null>(() =>
    tokenId != null ? pollCache.get(tokenId)?.data ?? null : null,
  );
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (tokenId == null) {
      setPoll(null);
      return;
    }
    const cached = pollCache.get(tokenId);
    if (cached && isCacheFresh(cached)) {
      setPoll(cached.data);
      return;
    }
    setLoading(true);
    fetchPollCached(tokenId).then((data) => {
      if (mountedRef.current) {
        setPoll(data);
        setLoading(false);
      }
    });
  }, [tokenId]);

  const refetch = useCallback(async () => {
    if (tokenId == null) return;
    const data = await fetchPollCached(tokenId, true);
    if (mountedRef.current) setPoll(data);
  }, [tokenId]);

  return { poll, loading, refetch };
}

export function useCreatePoll() {
  const [loading, setLoading] = useState(false);

  const create = useCallback(async (params: CreatePollParams) => {
    setLoading(true);
    try {
      const res = await createPoll(params);
      toastSuccess("Poll created");
      return res.result;
    } catch (e: any) {
      toastError(e?.message || "Failed to create poll");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { createPoll: create, loading };
}

export function useVoteOnPoll() {
  const [loading, setLoading] = useState(false);

  const vote = useCallback(
    async (tokenId: number, optionIndexes: number[]) => {
      setLoading(true);
      try {
        const res = await voteOnPoll(tokenId, optionIndexes);
        invalidatePoll(tokenId);
        toastSuccess("Vote recorded");
        return res.result;
      } catch (e: any) {
        toastError(e?.message || "Failed to vote");
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { vote, loading };
}

export function useRemovePollVote() {
  const [loading, setLoading] = useState(false);

  const remove = useCallback(async (tokenId: number) => {
    setLoading(true);
    try {
      await removePollVote(tokenId);
      invalidatePoll(tokenId);
      toastSuccess("Vote removed");
    } catch (e: any) {
      toastError(e?.message || "Failed to remove vote");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { removeVote: remove, loading };
}

export function useClosePoll() {
  const [loading, setLoading] = useState(false);

  const close = useCallback(async (tokenId: number) => {
    setLoading(true);
    try {
      await closePoll(tokenId);
      invalidatePoll(tokenId);
      toastSuccess("Poll closed");
    } catch (e: any) {
      toastError(e?.message || "Failed to close poll");
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { closePoll: close, loading };
}
