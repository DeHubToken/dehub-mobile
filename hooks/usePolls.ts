import { useState, useCallback, useEffect, useRef } from "react";
import {
  createPoll,
  getPoll,
  voteOnPoll,
  removePollVote,
  closePoll,
  type CreatePollParams,
} from "../services/polls.service";
import type { DmPoll } from "../services/dm/dm.types";
import { toastError, toastSuccess } from "../libs/toast";

// Feed cards mount/unmount constantly while scrolling; without a cache every
// remount refires GET /poll/<id> (even for non-poll posts), tripping the API
// rate limiter. Cache results — including "not a poll" (null) — for 5 minutes
// and dedupe concurrent requests for the same tokenId.
const POLL_CACHE_TTL = 5 * 60 * 1000;
const pollCache = new Map<number, { data: DmPoll | null; ts: number }>();
const pollInflight = new Map<number, Promise<DmPoll | null>>();

function fetchPollCached(tokenId: number, force = false): Promise<DmPoll | null> {
  if (!force) {
    const cached = pollCache.get(tokenId);
    if (cached && Date.now() - cached.ts < POLL_CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
    const existing = pollInflight.get(tokenId);
    if (existing) return existing;
  }
  const promise = getPoll(tokenId)
    .then((res) => (res?.status ? (res.result as DmPoll | null) : null))
    .catch(() => null)
    .then((data) => {
      pollCache.set(tokenId, { data, ts: Date.now() });
      pollInflight.delete(tokenId);
      return data;
    });
  pollInflight.set(tokenId, promise);
  return promise;
}

export function invalidatePoll(tokenId: number) {
  pollCache.delete(tokenId);
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
    if (cached && Date.now() - cached.ts < POLL_CACHE_TTL) {
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
