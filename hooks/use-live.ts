import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveSession } from "../services/live.service";
import { toastError } from "../libs/toast";
import { LivestreamEvents } from '../services/enums/livestream.enum';
// RTMP publisher removed in WebRTC mode; keep commented imports for future fallback if needed.
// import { getRtmpPublisher } from '../services/rtmp.publisher';
// import { LIVEPEER_RTMP_SERVER } from '../config/constants';

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

interface UseLiveInternalOpts extends UseLiveOptions {
  livepeerId?: string;        // livepeer stream object id
  livepeerApiKey?: string;    // for polling fallback
}

export const useLive = (opts?: UseLiveInternalOpts) => {
  const [stage, setStage] = useState<LiveStage>('ready');
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
  // Store a registrar function from WebSocket context: (event, handler) => unsubscribe
  const socketOnRef = useRef<((event: string, handler: (data: any) => void) => (() => void) | void) | null>(null);
  const [socketVersion, setSocketVersion] = useState(0); // trigger re-subscribe when binding changes

  const bindSocket = useCallback((onFn: (event: string, handler: (data: any) => void) => (() => void) | void) => {
    socketOnRef.current = onFn;
    setSocketVersion(v => v + 1);
  }, []);

  const startingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const endingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const stageRef = useRef(stage);
  useEffect(() => { stageRef.current = stage; }, [stage]);

  const start = useCallback(async () => {
    if (stage !== 'ready' || !streamKey) return;
    // In WebRTC mode, UI component (WebRTCPublisher) performs the offer/answer. We just mark starting.
    setStage('starting');
    // Timeout safety: if we never receive StartStream event, revert to ready after 20s
    startingTimeoutRef.current && clearTimeout(startingTimeoutRef.current);
    startingTimeoutRef.current = setTimeout(() => {
      setStage(s => (s === 'starting' ? 'ready' : s));
    }, 20000);
  }, [stage, streamKey]);

  const end = useCallback(async () => {
    if (stage !== 'live') return;
    setStage('ending');
    pollAbortRef.current?.abort();
    // WebRTCPublisher will teardown when active flag becomes false (stage not starting/live)
    endingTimeoutRef.current && clearTimeout(endingTimeoutRef.current);
    endingTimeoutRef.current = setTimeout(() => {
      setStage(s => (s === 'ending' ? 'ended' : s));
    }, 15000);
  }, [stage]);

  const publisherFailed = useCallback((reason?: string) => {
    if (stageRef.current === 'starting') {
      startingTimeoutRef.current && clearTimeout(startingTimeoutRef.current);
      pollAbortRef.current?.abort();
      setStage('ready');
      if (reason) toastError(reason);
    }
  }, []);

  useEffect(() => {
    if (!socketOnRef.current) return;
    const unsubStart = socketOnRef.current(LivestreamEvents.StartStream, () => {
      startingTimeoutRef.current && clearTimeout(startingTimeoutRef.current);
      pollAbortRef.current?.abort();
      setStage('live');
    }) || (() => {});
    const unsubEnd = socketOnRef.current(LivestreamEvents.EndStream, () => {
      endingTimeoutRef.current && clearTimeout(endingTimeoutRef.current);
      setStage('ended');
    }) || (() => {});
    return () => {
      unsubStart();
      unsubEnd();
    };
  }, [socketVersion]);

  return {
    stage,
    streamId,
    ingestUrl,
    streamKey,
    createdTokenId,
    signature,
    reset,
    bindSocket,
    create,
    start,
    end,
    publisherFailed,
  };
};

export default useLive;
