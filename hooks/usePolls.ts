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

export function usePoll(tokenId: number | null) {
  const [poll, setPoll] = useState<DmPoll | null>(null);
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
    setLoading(true);
    getPoll(tokenId)
      .then((res) => {
        if (mountedRef.current && res?.status) setPoll(res.result);
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [tokenId]);

  const refetch = useCallback(async () => {
    if (tokenId == null) return;
    try {
      const res = await getPoll(tokenId);
      if (mountedRef.current && res?.status) setPoll(res.result);
    } catch {}
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
