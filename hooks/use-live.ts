import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveSession } from "../services/live.service";
import { toastError } from "../libs/toast";

export type LiveStage =
  | "idle"
  | "creating"
  | "ready"
  | "starting"
  | "live"
  | "ending"
  | "ended";

export interface UseLiveOptions {
  onCreated?: (res: {
    streamId: string;
    streamKey: string;
    ingestUrl: string;
    createdTokenId?: number;
    timestamp?: number;
    v?: number;
    r?: string;
    s?: string;
  }) => void;
}

export const useLive = (opts?: UseLiveOptions) => {
  const [stage, setStage] = useState<LiveStage>("idle");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [createdTokenId, setCreatedTokenId] = useState<number | undefined>(
    undefined
  );
  const [signature, setSignature] = useState<
    | { timestamp?: number; v?: number; r?: string; s?: string }
    | undefined
  >(undefined);

  const reset = useCallback(() => {
    setStage("idle");
    setStreamId(null);
    setIngestUrl(null);
    setStreamKey(null);
    setCreatedTokenId(undefined);
    setSignature(undefined);
  }, []);

  const create = useCallback(
    async (payload: {
      name: string;
      description: string;
      category: string[];
      streamInfo?: Record<string, unknown>;
      scheduleAt?: number | null;
      thumbnailUri?: string | null;
    }) => {
      try {
        setStage("creating");
  const res = await createLiveSession(payload);
        if (res?.error) throw new Error(res?.msg || "Failed to create live session");
        setStreamId(res.streamId);
        setIngestUrl(res.ingestUrl);
        setStreamKey(res.streamKey);
        setCreatedTokenId(res.createdTokenId);
        setSignature(
          res.timestamp || res.v || res.r || res.s
            ? { timestamp: res.timestamp, v: res.v, r: res.r, s: res.s }
            : undefined
        );
        setStage("ready");
        opts?.onCreated?.({
          streamId: res.streamId,
          streamKey: res.streamKey,
          ingestUrl: res.ingestUrl,
          createdTokenId: res.createdTokenId,
          timestamp: res.timestamp,
          v: res.v,
          r: res.r,
          s: res.s,
        });
      } catch (e: any) {
        setStage("idle");
        toastError(e?.message || "Live creation failed");
        throw e;
      }
    },
    [opts]
  );

  // Placeholder start/stop transitions; wire to backend later
  const start = useCallback(async () => {
    setStage((s) => (s === "ready" ? "live" : s));
  }, []);

  const end = useCallback(async () => {
    setStage((s) => (s === "live" ? "ended" : s));
  }, []);

  return {
    stage,
    streamId,
    ingestUrl,
    streamKey,
    createdTokenId,
    signature,
    reset,
    create,
    start,
    end,
  };
};

export default useLive;
