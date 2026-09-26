import { useCallback, useEffect, useRef, useState } from "react";
import { getLivepeerStream } from "../services/livepeer.service";
import { liveProviderOf } from "../libs/live-ingest";
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

// Live posts are created via /user_mint with postType=live (see
// hooks/useUploadLive.ts) before this hook ever mounts — the producer screen
// hydrates it with the stream the mint returned.
export interface UseLiveOptions {
  livepeerId?: string; // livepeer stream object id
  /**
   * Which ingest this stream lives on, off the stream's own record.
   *
   * A self-hosted broadcast never appears in Livepeer's stream API, so the
   * poll below cannot confirm it however long it runs.
   */
  provider?: string | null;
}

export const useLive = (opts?: UseLiveOptions) => {
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
  }, []);

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
  // Read off the stream, never off the build — a cutover in either direction
  // leaves existing streams on the ingest they were minted for.
  const isSelfHosted = liveProviderOf({ provider: opts?.provider }) === "mediamtx";
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
    if (stage !== "starting") return;
    if (!publisherConnected) {
      console.log("[useLive] live poll waiting for publisher connection");
      return;
    }

    // A self-hosted broadcast is not in Livepeer's stream API, so the poll
    // below can never see it — it ran for sixty seconds, learned nothing, and
    // then reverted a stream that was still publishing from SETTING UP back to
    // READY, re-enabling Go Live mid-broadcast.
    //
    // The publisher being connected is this device saying it is sending. That
    // is the strongest signal available here and it needs nothing from a third
    // party; the producer screen already treats it as proof the stream aired.
    if (isSelfHosted) {
      console.log("[useLive] self-hosted publisher connected -> LIVE");
      setStage((s) => (s === "starting" ? "live" : s));
      return;
    }

    if (!opts?.livepeerId) return;
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
  }, [stage, opts?.livepeerId, publisherConnected, isSelfHosted]);

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
    reset,
    bindSocket,
    start,
    end,
    publisherFailed,
    setPublisherConnected,
    publisherConnected,
    hydrate,
  };
};

export default useLive;
