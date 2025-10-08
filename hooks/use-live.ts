import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveSession } from "../services/live.service";
import { getLivepeerStream } from "../services/livepeer.service";
import { toastError } from "../libs/toast";
import { LivestreamEvents } from "../services/enums/livestream.enum";
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
  livepeerId?: string; // livepeer stream object id
}

export const useLive = (opts?: UseLiveInternalOpts) => {
  const [stage, setStage] = useState<LiveStage>("ready");
  // Debug: track stage transitions
  const stagePrevRef = useRef<LiveStage>("ready");
  useEffect(() => {
    if (stagePrevRef.current !== stage) {
      console.log(
        "[useLive] stage transition",
        stagePrevRef.current,
        "->",
        stage
      );
      stagePrevRef.current = stage;
    }
  }, [stage]);

  const [streamId, setStreamId] = useState<string | null>(null);
  const [ingestUrl, setIngestUrl] = useState<string | null>(null);
  const [streamKey, setStreamKey] = useState<string | null>(null);
  const [createdTokenId, setCreatedTokenId] = useState<number | undefined>(
    undefined
  );
  const [signature, setSignature] = useState<
    { timestamp?: number; v?: number; r?: string; s?: string } | undefined
  >(undefined);

  // Allow external screens (e.g., producer) to inject existing stream details fetched elsewhere.
  const hydratedRef = useRef(false);
  const hydrate = useCallback(
    (info: {
      streamId?: string | null;
      ingestUrl?: string | null;
      streamKey?: string | null;
    }) => {
      if (!info) return;
      const currentStage = stageRef.current;
      console.log("[useLive] hydrate called", { currentStage, info });
      if (
        currentStage === "live" ||
        currentStage === "ending" ||
        currentStage === "ended"
      ) {
        console.log("[useLive] hydrate skipped; stream already", currentStage);
        return;
      }
      // If already hydrated with same key/ids, ignore to avoid churn.
      if (
        hydratedRef.current &&
        info.streamKey === streamKey &&
        info.streamId === streamId
      ) {
        return;
      }
      console.log(
        "[useLive] hydrate invoked with",
        info,
        "at stage",
        currentStage
      );
      if (info.streamId !== undefined) setStreamId(info.streamId || null);
      if (info.ingestUrl !== undefined) setIngestUrl(info.ingestUrl || null);
      if (info.streamKey !== undefined) setStreamKey(info.streamKey || null);
      hydratedRef.current = true;
      setStage((s) => {
        if (
          (s === "idle" || s === "creating") &&
          (info.streamKey || info.streamId)
        )
          return "ready";
        return s;
      });
    },
    [streamId, streamKey]
  );

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
        if (res?.error)
          throw new Error(res?.msg || "Failed to create live session");
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
  const socketOnRef = useRef<
    | ((event: string, handler: (data: any) => void) => (() => void) | void)
    | null
  >(null);
  const [socketVersion, setSocketVersion] = useState(0); // trigger re-subscribe when binding changes

  const bindSocket = useCallback(
    (
      onFn: (event: string, handler: (data: any) => void) => (() => void) | void
    ) => {
      socketOnRef.current = onFn;
      setSocketVersion((v) => v + 1);
    },
    []
  );

  const startingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const endingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const livePollRef = useRef<NodeJS.Timeout | null>(null);
  const endPollRef = useRef<NodeJS.Timeout | null>(null);
  const livePollStartedRef = useRef(false);
  const endPollStartedRef = useRef(false);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // Gate optimistic Livepeer polling until publisher signals connected
  const [publisherConnected, setPublisherConnectedState] = useState(false);
  const setPublisherConnected = useCallback((val: boolean) => {
    setPublisherConnectedState(val);
    console.log("[useLive] publisherConnected ->", val);
  }, []);

  const start = useCallback(async () => {
    console.log("[useLive] start()", { stage, hasStreamKey: !!streamKey });
    if (stage !== "ready" || !streamKey) {
      console.log(
        "[useLive] start() ignored. stage:",
        stage,
        "streamKey?",
        !!streamKey
      );
      return;
    }
    console.log("[useLive] start() invoked. Marking starting.");
    setStage("starting");
    // Begin optimistic polling for LIVE state as soon as we have a streamId
    livePollStartedRef.current = false; // allow poll effect to kick in
  }, [stage, streamKey]);

  const end = useCallback(async () => {
    if (!(stage === "live" || stage === "starting")) {
      console.log("[useLive] end() ignored. stage:", stage);
      return;
    }
    console.log("[useLive] end() invoked. Marking ending.");
    setStage("ending");
    pollAbortRef.current?.abort();
    endingTimeoutRef.current && clearTimeout(endingTimeoutRef.current);
    // Start optimistic polling for ENDED state (will reconcile when backend event arrives)
    endPollStartedRef.current = false; // allow end poll effect to start
  }, [stage]);

  const publisherFailed = useCallback((reason?: string) => {
    if (stageRef.current === "starting") {
      console.log("[useLive] publisherFailed while starting. reason:", reason);
      startingTimeoutRef.current && clearTimeout(startingTimeoutRef.current);
      pollAbortRef.current?.abort();
      setStage("ready");
      if (reason) toastError(reason);
    }
  }, []);

  useEffect(() => {
    if (!socketOnRef.current) return;
    console.log("[useLive] binding socket listeners", {
      version: socketVersion,
    });
    const unsubStart =
      socketOnRef.current(LivestreamEvents.StartStream, () => {
        console.log("[useLive] LivestreamEvents.StartStream received");
        startingTimeoutRef.current && clearTimeout(startingTimeoutRef.current);
        pollAbortRef.current?.abort();
        setStage("live");
        // Stop any optimistic live polling
        if (livePollRef.current) {
          clearTimeout(livePollRef.current);
          livePollRef.current = null;
        }
      }) || (() => {});
    const unsubEnd =
      socketOnRef.current(LivestreamEvents.EndStream, () => {
        console.log("[useLive] LivestreamEvents.EndStream received");
        endingTimeoutRef.current && clearTimeout(endingTimeoutRef.current);
        setStage("ended");
        if (endPollRef.current) {
          clearTimeout(endPollRef.current);
          endPollRef.current = null;
        }
      }) || (() => {});
    return () => {
      console.log("[useLive] unbinding socket listeners");
      unsubStart();
      unsubEnd();
    };
  }, [socketVersion]);

  // Optimistic polling for LIVE state while stage === 'starting'
  useEffect(() => {
    if (stage !== "starting" || !opts?.livepeerId) return;
    if (!publisherConnected) {
      console.log("[useLive] live poll waiting for publisher connection");
      return;
    }
    if (livePollStartedRef.current) return;
    livePollStartedRef.current = true;
    console.log("[useLive] live polling loop initiated", {
      livepeerId: opts?.livepeerId,
    });
    const POLL_MS = 3000;
    const startedAt = Date.now();
    const poll = async () => {
      if (stageRef.current !== "starting") return;
      try {
        const info = await getLivepeerStream(opts.livepeerId!);
        console.log("[useLive] live poll tick", {
          isActive: info?.isActive,
          id: info?.id,
        });
        if (info?.isActive) {
          console.log("[useLive] optimistic LIVE (Livepeer isActive true)");
          setStage((s) => (s === "starting" ? "live" : s));
          return;
        }
      } catch (e) {
        console.log(
          "[useLive] live polling error (ignored):",
          (e as any)?.message
        );
      }
      if (Date.now() - startedAt > 60000) {
        console.log("[useLive] live polling timed out; reverting to ready");
        setStage((s) => (s === "starting" ? "ready" : s));
        return;
      }
      livePollRef.current = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      if (livePollRef.current) {
        clearTimeout(livePollRef.current);
        livePollRef.current = null;
      }
    };
  }, [stage, opts?.livepeerId, publisherConnected]);

  // Optimistic polling for ENDED state while stage === 'ending'
  useEffect(() => {
    if (stage !== "ending" || !opts?.livepeerId) return;
    if (endPollStartedRef.current) return;
    endPollStartedRef.current = true;
    console.log("[useLive] end polling loop initiated", {
      livepeerId: opts?.livepeerId,
    });
    const POLL_MS = 3000;
    const startedAt = Date.now();
    const poll = async () => {
      if (stageRef.current !== "ending") return;
      try {
        const info = await getLivepeerStream(opts.livepeerId!);
        console.log("[useLive] end poll tick", {
          isActive: info?.isActive,
          id: info?.id,
        });
        if (info && !info.isActive) {
          console.log("[useLive] optimistic ENDED (Livepeer isActive false)");
          setStage((s) => (s === "ending" ? "ended" : s));
          return;
        }
      } catch (e) {
        const msg = (e as any)?.message || "";
        console.log("[useLive] end polling error (ignored):", msg);
        if (msg.includes("404")) {
          console.log(
            "[useLive] Livepeer returned 404 for stream; treating as ENDED"
          );
          setStage((s) => (s === "ending" ? "ended" : s));
          return;
        }
      }
      if (Date.now() - startedAt > 60000) {
        console.log("[useLive] end polling timed out; forcing ended");
        setStage((s) => (s === "ending" ? "ended" : s));
        return;
      }
      endPollRef.current = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      if (endPollRef.current) {
        clearTimeout(endPollRef.current);
        endPollRef.current = null;
      }
    };
  }, [stage, opts?.livepeerId]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      [startingTimeoutRef, endingTimeoutRef, livePollRef, endPollRef].forEach(
        (ref) => {
          if (ref.current) clearTimeout(ref.current);
        }
      );
    };
  }, []);

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
    setPublisherConnected,
    publisherConnected,
    hydrate,
  };
};

export default useLive;
