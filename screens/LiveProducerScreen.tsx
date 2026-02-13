import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  InteractionManager,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { useLive } from "../hooks/use-live";
import { useWebSocket } from "../context/WebSocketContext";
import ProducerStatusBar from "../components/LiveProducer/ProducerStatusBar";
import ProducerControlsBar from "../components/LiveProducer/ProducerControlsBar";
import { useCameraPermissions } from "expo-camera";
// NodeMediaCamera removed in WebRTC mode; keeping import commented for potential fallback.
// import NodeMediaCamera from '../components/LiveProducer/NodeMediaCamera';
import WebRTCPublisher from "../components/LiveProducer/WebRTCPublisher";
import ExternalStreamingOverlay from "../components/LiveProducer/ExternalStreamingOverlay";
import LiveChatPanel from "../components/LiveProducer/LiveChatPanel";
import MetadataCard from "../components/LiveProducer/MetadataCard";
import StreamDetailsTooltip from "../components/LiveProducer/StreamDetailsTooltip";
import EphemeralMessages from "../components/LiveProducer/EphemeralMessages";
import TipAnimationsOverlay from "../components/LiveProducer/TipAnimationsOverlay";
import ReactionOverlay from "../components/LiveProducer/ReactionOverlay";
import { useTipAnimations } from "../hooks/useTipAnimations";
import { useReactions } from "../hooks/useReactions";
import { useStreamDetails } from "../hooks/useStreamDetails";
import { useEphemeralMessages } from "../hooks/useEphemeralMessages";
import GlassModal from "../components/ui/GlassModal";
import { LivestreamEvents, StreamActivityType, StreamStatus } from "../services/enums/livestream.enum";
import { toastSuccess, toastError, toastInfo } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import { createViewCountUpdater, seedViewerStats } from "../libs/viewers.util";
import { updateStreamSettings } from "../services/live.service";
import { useAuth } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";

type RouteParams = {
  streamId?: string;
  tokenId?: number;
  ingestUrl?: string;
  streamKey?: string;
};

const LiveProducerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { isSignedIn, needsUsername } = useAuth();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const { streamId, tokenId, ingestUrl, streamKey } = (route.params ||
    {}) as RouteParams;
  const {
    on: socketOn,
    emitAuthed: socketEmitAuthed,
    connected,
  } = useWebSocket();
  // console.log("LiveProducers", { connected });
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const [chatVisible, setChatVisible] = useState(false);
  // Legacy simulated messages removed; real chat handled inside LiveChatPanel
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Unseen chat badge removed (panel itself can manage highlighting later)
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [externalMode, setExternalMode] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("front");
  const [permission, requestPermission] = useCameraPermissions();
  const {
    streamEntity,
    streamLoading,
    streamError,
    streamKeyValue,
    streamKeyLoading,
    streamKeyError,
  } = useStreamDetails(streamId);
  console.log({streamEntity, streamId, tokenId, ingestUrl, streamKey})
  const {
    stage,
    start,
    end,
    bindSocket,
    hydrate,
    publisherFailed,
    setPublisherConnected,
    publisherConnected,
  } = useLive({ livepeerId: streamEntity?.livepeerId });
  // Bind socket on() from context directly into live hook (after useLive exists)
  useEffect(() => {
    bindSocket((evt, handler) => socketOn(evt, handler));
  }, [bindSocket, socketOn]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const metaCardRef = useRef<View | null>(null);
  const [sourceRect, setSourceRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const uiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { ephemeral, addEphemeral, fadeAnim } = useEphemeralMessages();
  const {
    items: tipEffects,
    enqueueFromGift,
    clearAll,
  } = useTipAnimations({ maxConcurrent: 2 });
  const { reactions, addReaction, removeReaction, clearReactions } = useReactions();
  // Stream paused/resumed state
  const [streamPaused, setStreamPaused] = useState(false);
  // Grace period countdown for PAUSED state
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState<number>(90);
  const [graceCountdown, setGraceCountdown] = useState<number>(0);
  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Live settings state (mirrors stream entity settings, can be toggled while live)
  const [liveChatEnabled, setLiveChatEnabled] = useState(true);
  // Scheduled stream info
  const isScheduled = (streamEntity as any)?.status?.toUpperCase?.() === 'SCHEDULED' ||
    !!((streamEntity as any)?.scheduledFor && new Date((streamEntity as any)?.scheduledFor).getTime() > Date.now());
  const scheduledForDate = (streamEntity as any)?.scheduledFor
    ? new Date((streamEntity as any).scheduledFor) : null;

  // Sync liveChatEnabled from stream entity settings
  useEffect(() => {
    const chatSetting = (streamEntity as any)?.settings?.chat?.enabled ??
      (streamEntity as any)?.settings?.enableChat;
    if (typeof chatSetting === 'boolean') setLiveChatEnabled(chatSetting);
  }, [streamEntity]);

  // Grace period countdown tick
  useEffect(() => {
    if (!streamPaused || graceCountdown <= 0) {
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      return;
    }
    graceTimerRef.current = setInterval(() => {
      setGraceCountdown((prev) => {
        if (prev <= 1) {
          if (graceTimerRef.current) {
            clearInterval(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [streamPaused, graceCountdown]);

  // Centralized chat activity list for LiveChatPanel
  const [chatActivities, setChatActivities] = useState<
    Array<{
      status: any;
      address?: string;
      createdAt?: number;
      meta?: any;
      optimistic?: boolean;
    }>
  >([]);

    // Keep a small rolling memory of recent optimistic messages to dedupe server echoes
  const recentOptimisticRef = useRef<Array<{ key: string; ts: number }>>([]);
  const rememberOptimistic = useCallback((key: string) => {
    const now = Date.now();
    recentOptimisticRef.current = recentOptimisticRef.current
      .filter((it) => now - it.ts < 15000)
      .concat({ key, ts: now })
      .slice(-50);
  }, []);
  const hasRecentOptimistic = useCallback((key: string) => {
    const now = Date.now();
    recentOptimisticRef.current = recentOptimisticRef.current.filter((it) => now - it.ts < 15000);
    return recentOptimisticRef.current.some((it) => it.key === key);
  }, []);

  const addChatActivity = useCallback((a: any) => {
    // If this is an optimistic local message, remember it for echo dedupe
    if (
      a?.optimistic === true &&
      a?.status === StreamActivityType.MESSAGE &&
      (a?.meta?.content || '').trim()
    ) {
      const key = `${String((a.address || a?.meta?.username || '')).toLowerCase()}::${String(
        (a?.meta?.content || '').trim()
      )}`;
      try { rememberOptimistic(key); } catch {}
    }
    setChatActivities((prev) =>
      prev.concat({ ...a, createdAt: a?.createdAt ?? Date.now() }).slice(-400)
    );
  }, [rememberOptimistic]);



  // Seed initial chat activities from streamEntity so panel mode mirrors stack behavior
  const seededInitialActivitiesRef = useRef<string | null>(null);
  useEffect(() => {
    if (!streamEntity) return;
    const sid = (streamEntity as any)?._id || streamId;
    if (!sid) return;
    if (seededInitialActivitiesRef.current === sid) return;
    const rawAct =
      (streamEntity as any)?.activities?.act ||
      (streamEntity as any)?.activities ||
      (streamEntity as any)?.act;
    if (!Array.isArray(rawAct) || rawAct.length === 0) {
      seededInitialActivitiesRef.current = sid;
      return;
    }
    const mapStatus = (s: any): StreamActivityType | 'SYSTEM' => {
      const u = String(s || '').toUpperCase();
      switch (u) {
        case 'MESSAGE':
          return StreamActivityType.MESSAGE;
        case 'JOINED':
        case 'JOIN':
        case 'ENTER':
          return StreamActivityType.JOINED;
        case 'LEFT':
        case 'LEAVE':
        case 'EXIT':
          return StreamActivityType.LEFT;
        case 'TIP':
        case 'GIFT':
          return StreamActivityType.TIP;
        case 'START':
        case 'STREAM_START':
          return StreamActivityType.START;
        case 'END':
        case 'ENDED':
        case 'STREAM_END':
          return StreamActivityType.END;
        default:
          return 'SYSTEM';
      }
    };
    const initial = (rawAct as any[])
      .map((it: any) => ({
        status: mapStatus(it?.status),
        address: (it?.address as string | undefined) || (it?.user?.address as string | undefined),
        createdAt: it?.createdAt ? new Date(it.createdAt).getTime() : Date.now(),
        meta: it?.meta || it?.message?.meta || {
          username: it?.user?.username,
          content: it?.message?.content,
          amount: it?.gift?.meta?.amount,
          avatarImageUrl: it?.user?.avatarImageUrl,
        },
      }))
      .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0));
    setChatActivities((prev) => ([...initial, ...prev]).slice(-400));
    seededInitialActivitiesRef.current = sid;
  }, [streamEntity, streamId]);
  // Single-capture: WebRTCPublisher handles preview + publish
  // Realtime dynamic counters (decoupled from initial streamEntity)
  const [liveViewers, setLiveViewers] = useState<number>(0);
  const [peakViewers, setPeakViewers] = useState<number>(0);
  const peakViewersRef = useRef<number>(0);
  useEffect(() => { peakViewersRef.current = peakViewers; }, [peakViewers]);
  const [liveLikes, setLiveLikes] = useState<number>(
    typeof streamEntity?.likes === "number"
      ? (streamEntity?.likes as number)
      : typeof (streamEntity as any)?.likesCount === "number"
      ? ((streamEntity as any)?.likesCount as number)
      : 0
  );
  const [totalTips, setTotalTips] = useState<number>(0);
  // Shared viewer update utils
  // Hydrate live hook with fetched stream details (streamKeyValue etc.)
  useEffect(() => {
    if (streamKeyValue || streamId || ingestUrl) {
      hydrate({ streamId, ingestUrl, streamKey: streamKeyValue || streamKey });
    }
  }, [streamKeyValue, streamId, ingestUrl, streamKey, hydrate]);

  // Join stream room (producer presence) once after hydrate (avoid duplicates)
  const joinedRoomRef = useRef(false);
  useEffect(() => {
    if (!streamId || joinedRoomRef.current === true) return;
    console.log("[LiveProducer] emit JoinRoom (once)", streamId);
    socketEmitAuthed(LivestreamEvents.JoinRoom, { streamId });
    joinedRoomRef.current = true;
  }, [streamId, socketEmitAuthed]);

  // Rejoin on reconnect
  useEffect(() => {
    if (!connected || !streamId) return;
    console.log("[LiveProducer] Reconnected, rejoin room");
    socketEmitAuthed(LivestreamEvents.JoinRoom, { streamId });
    // don't JoinStream as streamer, only join room.
    // if (stage === 'starting' || stage === 'live') {
    //   socketEmitAuthed(LivestreamEvents.JoinStream, { streamId });
    // }
  }, [connected, streamId, stage, socketEmitAuthed]);

  // Throttle metadata for view count updates (500ms window)
  const viewUpdateMetaRef = useRef<{
    last: number;
    latest: number;
    timer: any;
  }>({ last: 0, latest: 0, timer: null });

  // Socket event listeners: start, end, view count, like, tip
  useEffect(() => {
    if (!streamId) return;
    console.log("[LiveProducer] binding socket listeners", { streamId });
    const subs: Array<() => void> = [];
    const make = (evt: LivestreamEvents, handler: (d: any) => void) => {
      console.log("[LiveProducer] socket.on bind", evt);
      const off = socketOn(evt, handler) || (() => {});
      subs.push(off);
    };

    make(LivestreamEvents.StartStream, (data) => {
      console.log('[producer] frontend received', LivestreamEvents.StartStream, data);
      console.log("[LiveProducer] Socket StartStream event", data);
      setStartedAt((prev) => prev || Date.now());
      // Clear any paused state on stream start/resume
      setStreamPaused(false);
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      addChatActivity({
        status: StreamActivityType.START,
        meta: { message: "Stream has started." },
      });
    });
    make(LivestreamEvents.EndStream, (data) => {
      console.log('[producer] frontend received', LivestreamEvents.EndStream, data);
      console.log("[LiveProducer] Socket EndStream event", data);
      // Clear paused state on end
      setStreamPaused(false);
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      // Stage change handled by hook via bind, but we can snapshot viewers
      addChatActivity({
        status: StreamActivityType.END,
        meta: { message: "Stream has ended." },
      });
    });
    const updater = createViewCountUpdater({
      setLive: setLiveViewers,
      setPeak: setPeakViewers,
      getPeak: () => peakViewersRef.current,
      debounceMs: 500,
    });
    make(LivestreamEvents.ViewCountUpdate, ({ viewerCount }: any) => {
      console.log('[producer] frontend received', LivestreamEvents.ViewCountUpdate, { viewerCount });
      updater.onViewCount(typeof viewerCount === 'number' ? viewerCount : 0);
    });
    make(LivestreamEvents.LikeStream, (payload: any) => {
      console.log('[producer] frontend received', LivestreamEvents.LikeStream, payload);
      console.log("[LiveProducer] Socket LikeStream event", payload);
      if (typeof payload?.likes === "number") setLiveLikes(payload.likes);
    });
    make(LivestreamEvents.TipStreamer, (payload: any) => {
      console.log('[producer] frontend received', LivestreamEvents.TipStreamer, payload);
      console.log("[LiveProducer] Socket TipStreamer event", payload);
      const amt = Number(payload?.gift?.meta?.amount || 0);
      if (!isNaN(amt) && amt > 0) setTotalTips((t) => t + amt);
      // Also reflect in chat activity
      const gift = payload?.gift;
      // Enqueue visual effect per tier
      enqueueFromGift({
        amount: gift?.meta?.amount,
        message: gift?.meta?.message,
        username: gift?.meta?.username || gift?.meta?.displayName,
        selectedTier: gift?.meta?.selectedTier,
      } as any);
      addChatActivity({
        status: StreamActivityType.TIP,
        address: gift?.meta?.address,
        meta: {
          username: gift?.meta?.username || gift?.meta?.displayName,
          amount: Number(gift?.meta?.amount) || 0,
        },
      });
    });
    // Chat message and presence events
    make(LivestreamEvents.SendMessage, (payload: any) => {
      const m = payload?.message || payload;
      const meta = m?.meta || payload?.meta || {};
      const content = meta?.content || m?.content || m?.meta?.content;
      const username = m?.user?.username || meta?.username;
      const addr = m?.user?.address || meta?.address;
      if (!content) return;
      const key = `${(addr || username || '').toLowerCase()}::${String(content).trim()}`;
      // If we have a recent optimistic with the same key, confirm it instead of adding a duplicate
      if (hasRecentOptimistic(key)) {
        setChatActivities((prev) => {
          const copy = prev.slice();
          const idx =
            copy
              .map((a, i) => ({ a, i }))
              .reverse()
              .find((x) =>
                x.a.optimistic &&
                x.a.status === StreamActivityType.MESSAGE &&
                ((x.a.address || '').toLowerCase() === (addr || '').toLowerCase() ||
                  (x.a.meta?.username || '').toLowerCase() === (username || '').toLowerCase()) &&
                String(x.a.meta?.content || '').trim() === String(content).trim()
              )?.i ?? -1;
          if (idx >= 0) {
            const existing = copy[idx];
            copy[idx] = { ...existing, optimistic: false } as any;
            return copy;
          }
          return prev;
        });
        return;
      }
      addChatActivity({
        status: StreamActivityType.MESSAGE,
        address: addr,
        meta: {
          username,
          content,
          avatarImageUrl: m?.user?.avatarImageUrl || meta?.avatarImageUrl,
        },
      });
      addEphemeral({
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        user: username || addr || "user",
        message: content,
        createdAt: Date.now(),
      } as any);
    });
    make(LivestreamEvents.JoinStream, (data: any) => {
      addChatActivity({
        status: StreamActivityType.JOINED,
        address: data?.user?.address,
        meta: {
          username: data?.user?.username,
          avatarImageUrl: data?.user?.avatarImageUrl,
        },
      });
    });
    make(LivestreamEvents.LeaveStream, (data: any) => {
      addChatActivity({
        status: StreamActivityType.LEFT,
        address: data?.user?.address,
        meta: {
          username: data?.user?.username,
          avatarImageUrl: data?.user?.avatarImageUrl,
        },
      });
    });
    // Reaction events from viewers
    make(LivestreamEvents.StreamReaction, (data: any) => {
      const type = data?.type as import('../components/LiveProducer/ReactionOverlay').ReactionType;
      const username = data?.user?.username;
      if (type) addReaction(type, username);
    });
    // Settings update (echoed back when we PATCH, or from admin)
    make(LivestreamEvents.SettingsUpdate, (data: any) => {
      console.log('[producer] frontend received', LivestreamEvents.SettingsUpdate, data);
      const settings = data?.settings;
      if (settings) {
        const chatEnabled = settings?.chat?.enabled ?? settings?.enableChat;
        if (typeof chatEnabled === 'boolean') setLiveChatEnabled(chatEnabled);
      }
    });
    // Stream paused/resumed (e.g. temporary ingest interruption) with grace period
    make(LivestreamEvents.StreamPaused, (data: any) => {
      console.log('[producer] stream paused', data);
      setStreamPaused(true);
      const grace = typeof data?.gracePeriodSeconds === 'number' ? data.gracePeriodSeconds : 90;
      setGracePeriodSeconds(grace);
      setGraceCountdown(grace);
    });
    make(LivestreamEvents.StreamResumed, () => {
      console.log('[producer] stream resumed');
      setStreamPaused(false);
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    });
    return () => {
      console.log("[LiveProducer] unbinding socket listeners");
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      clearAll();
      clearReactions();
      try { updater.dispose(); } catch {}
    };
  }, [streamId, socketOn]);

  // Seed initial viewers/peak from stream details once per stream
  const seededViewersRef = useRef<string | null>(null);
  useEffect(() => {
    if (!streamEntity) return;
    const sid = (streamEntity as any)?._id || streamId;
    if (!sid) return;
    if (seededViewersRef.current === sid) return;
    const init = seedViewerStats(streamEntity);
    setLiveViewers(init.liveViewers);
    setPeakViewers(init.peakViewers);
    seededViewersRef.current = sid;
  }, [streamEntity, streamId]);

  // Mirror likes from stream details when it loads/changes
  useEffect(() => {
    const nextLikes =
      (typeof streamEntity?.likes === "number"
        ? (streamEntity?.likes as number)
        : undefined) ??
      (typeof (streamEntity as any)?.likesCount === "number"
        ? ((streamEntity as any)?.likesCount as number)
        : undefined);
    if (typeof nextLikes === "number") setLiveLikes(nextLikes);
  }, [streamEntity?.likes, (streamEntity as any)?.likesCount]);
  const [publishStats, setPublishStats] = useState<{
    fps?: number;
    bitrateKbps?: number;
    dropped?: number;
  }>({});

  const onStart = useCallback(() => {
    console.log("[LiveProducer] onStart invoked. Current stage:", stage);
    if (!externalMode) {
      // Ensure video is enabled before starting publishing to avoid blank preview
      setCameraOff(false);
    } else {
      // External mode: signal publisher as "connected" so live polling can begin
      // (The actual video ingest comes from external software)
      setPublisherConnected(true);
    }
    start()
      .then(() => {
        console.log(
          "[LiveProducer] start() promise resolved. (Stage will likely be starting/live soon)",
          stage
        );
        setStartedAt(Date.now());
      })
      .catch((err) => {
        console.log("[LiveProducer] start() promise rejected:", err);
      });
  }, [start, stage, externalMode, setPublisherConnected]);

  const onEnd = useCallback(() => {
    console.log("[LiveProducer] onEnd invoked. Current stage:", stage);
    // Emit stream.end to server so all viewers get notified
    if (streamId) {
      try { socketEmitAuthed(LivestreamEvents.EndStream, { streamId }); } catch {}
    }
    // Fire-and-forget end; don't wait for Livepeer.
    end().catch(() => {});
    // Mark ended to avoid duplicate end on unmount
    endedRef.current = true;
    toastSuccess("Livestream ended");
    navigation.goBack();
  }, [end, navigation, stage, streamId, socketEmitAuthed]);

  const requestClose = useCallback(() => {
    // End stream immediately if live-ish; do not wait
    if (stage === "starting" || stage === "live" || stage === "ending") {
      console.log(
        "[LiveProducer] requestClose -> immediate end without waiting"
      );
      if (streamId) {
        try { socketEmitAuthed(LivestreamEvents.EndStream, { streamId }); } catch {}
      }
      end().catch(() => {});
      endedRef.current = true;
      toastSuccess("Livestream ended");
    }
    navigation.goBack();
  }, [navigation, stage, end, streamId, socketEmitAuthed]);

  // Toggle chat enabled while live (PATCH /live/:streamId/settings)
  const [settingsUpdating, setSettingsUpdating] = useState(false);
  const handleToggleLiveChat = useCallback(async () => {
    const sid = streamId || (streamEntity as any)?._id;
    if (!sid || stage !== 'live') return;
    const newVal = !liveChatEnabled;
    setSettingsUpdating(true);
    // Optimistic
    setLiveChatEnabled(newVal);
    try {
      await updateStreamSettings(sid, { chat: { enabled: newVal } });
      toastInfo(newVal ? 'Chat enabled' : 'Chat disabled');
    } catch (e: any) {
      // Revert
      setLiveChatEnabled(!newVal);
      toastError(e?.message || 'Failed to update settings');
    } finally {
      setSettingsUpdating(false);
    }
  }, [streamId, streamEntity, stage, liveChatEnabled]);

  const openEndConfirm = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const closeEndConfirm = useCallback(() => setShowEndConfirm(false), []);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

  const toggleMic = useCallback(() => setMicMuted((m) => !m), []);
  const toggleCamera = useCallback(() => setCameraOff((c) => !c), []);
  const toggleExternal = useCallback(() => {
    setExternalMode((prev) => {
      const next = !prev;
      if (next) {
        setCameraOff(true);
        setMicMuted(true);
      }
      return next;
    });
  }, []);
  const lastFlipRef = useRef(0);
  const flipCamera = useCallback(() => {
    const now = Date.now();
    if (now - lastFlipRef.current < 1000) return; // stronger debounce to avoid jitter
    lastFlipRef.current = now;
    setCameraFacing((prev) => (prev === "front" ? "back" : "front"));
  }, []);

  const openDetails = useCallback(() => {
    if (!streamEntity) return;
    if (metaCardRef.current && (metaCardRef.current as any).measureInWindow) {
      (metaCardRef.current as any).measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          setSourceRect({ x, y, width, height });
          setShowDetailsModal(true);
        }
      );
    } else {
      setShowDetailsModal(true);
    }
  }, [streamEntity, streamId, streamKeyValue, streamKeyLoading]);

  const closeDetails = useCallback(() => {
    setShowDetailsModal(false);
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  }, []);

  // Auto-dismiss after inactivity (5s) once opened
  useEffect(() => {
    if (showDetailsModal) {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        setShowDetailsModal(false);
      }, 3000);
    }
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [showDetailsModal]);

  const registerActivity = useCallback(() => {
    if (!showDetailsModal) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      setShowDetailsModal(false);
    }, 3000);
  }, [showDetailsModal]);

  // Copy handlers now internal to tooltip / overlay components

  // positioning now handled inside tooltip component

  // UI inactivity hide (except status bar & ephemeral)
  const bumpUiTimer = useCallback(() => {
    // Always reveal UI on interaction
    setUiHidden(false);
    // Clear any existing timer
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    // If chat panel is open, don't auto-hide controls
    if (chatVisible) return;
    // Otherwise, start inactivity timer
    uiTimerRef.current = setTimeout(() => {
      setUiHidden(true);
      // close details modal if open
      setShowDetailsModal(false);
    }, 4000);
  }, [chatVisible]);

  useEffect(() => {
    bumpUiTimer();
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
  }, [bumpUiTimer]);

  // Keep controls visible while chat is open; resume auto-hide when closed
  useEffect(() => {
    if (chatVisible) {
      setUiHidden(false);
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    } else {
      bumpUiTimer();
    }
  }, [chatVisible, bumpUiTimer]);

  // Debug: log stage transitions
  const prevStageRef = useRef(stage);
  // Track latest stage for unmount cleanup without re-running effect
  const latestStageRef = useRef(stage);
  const endedRef = useRef(false);
  // Keep a stable reference to end() so unmount cleanup doesn't depend on end identity
  const endRef = useRef(end);
  useEffect(() => {
    endRef.current = end;
  }, [end]);
  useEffect(() => {
    if (prevStageRef.current !== stage) {
      console.log(
        "[LiveProducer] stage transition:",
        prevStageRef.current,
        "->",
        stage
      );
      prevStageRef.current = stage;
    }
    latestStageRef.current = stage;
    // On ended, notify and leave the screen automatically
    if (stage === "ended") {
      toastSuccess("Livestream ended");
      navigation.goBack();
    }
  }, [stage]);

  const prevPermissionRef = useRef(permission?.granted);
  useEffect(() => {
    if (prevPermissionRef.current !== permission?.granted) {
      console.log(
        "[LiveProducer] camera permission changed ->",
        permission?.granted
      );
      prevPermissionRef.current = permission?.granted;
    }
  }, [permission?.granted]);

  // Debug: publish stats changes (bitrate/fps/dropped)
  const lastStatsRef = useRef(publishStats);
  useEffect(() => {
    if (publishStats !== lastStatsRef.current) {
      const { fps, bitrateKbps, dropped } = publishStats;
      // console.log("[LiveProducer] publish stats update:", {
      //   fps,
      //   bitrateKbps,
      //   dropped,
      // });
      lastStatsRef.current = publishStats;
    }
  }, [publishStats]);

  // Debug: details tooltip open/close events
  const prevDetailsVisibleRef = useRef(showDetailsModal);
  useEffect(() => {
    if (prevDetailsVisibleRef.current !== showDetailsModal) {
      console.log(
        "[LiveProducer] stream details tooltip visibility ->",
        showDetailsModal
      );
      prevDetailsVisibleRef.current = showDetailsModal;
    }
  }, [showDetailsModal]);

  // Debug: external mode toggles
  const prevExternalModeRef = useRef(externalMode);
  useEffect(() => {
    if (prevExternalModeRef.current !== externalMode) {
      console.log("[LiveProducer] externalMode changed ->", externalMode);
      prevExternalModeRef.current = externalMode;
    }
  }, [externalMode]);

  // Debug: camera facing changes
  const prevFacingRef = useRef(cameraFacing);
  useEffect(() => {
    if (prevFacingRef.current !== cameraFacing) {
      console.log("[LiveProducer] cameraFacing changed ->", cameraFacing);
      prevFacingRef.current = cameraFacing;
    }
  }, [cameraFacing]);

  // Disable swipe/gesture dismiss for this screen
  useEffect(() => {
    navigation.setOptions?.({ gestureEnabled: false });
    return () => {
      // component unmount (navigation away) -> ensure end
      const s = latestStageRef.current;
      if (
        !endedRef.current &&
        (s === "starting" || s === "live" || s === "ending")
      ) {
        console.log("[LiveProducer] unmount cleanup ending stream");
        const fn = endRef.current;
        if (typeof fn === "function") {
          Promise.resolve(fn()).catch(() => {});
        }
      }
    };
  }, [navigation]);

  // no camera handoff delay needed
  // Defer heavy publisher mount until after initial interactions to render instantly
  const [mountPublisher, setMountPublisher] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setMountPublisher(true);
    });
    return () => {
      // @ts-ignore types don't include cancel on web
      task?.cancel?.();
    };
  }, []);

  // If stream is already live or ended, redirect to viewer instead of producer
  const [redirecting, setRedirecting] = useState(false);
  const initialRedirectCheckedRef = useRef(false);
  useEffect(() => {
    // Only evaluate redirect once, on first load resolution
    if (initialRedirectCheckedRef.current) return;
    if (streamLoading) return;
    initialRedirectCheckedRef.current = true;
    const status = (
      (streamEntity as any)?.status as string | undefined
    )?.toLowerCase();
    if (status === "ended") {
      // Stream already ended — redirect to viewer for recap
      setRedirecting(true);
      console.log("[LiveProducer] redirecting to LiveViewer due to ENDED status");
      navigation.replace(ScreenNames.LiveViewer as any, {
        tokenId: tokenId || (streamEntity as any)?.tokenId,
        streamKey: streamKeyValue || streamKey,
        streamId: streamEntity?._id,
      });
    } else if (status === "live") {
      // Stream is already LIVE — could be external streaming.
      // Stay on producer but set stage to live for external monitoring.
      console.log("[LiveProducer] stream already LIVE on load — entering external monitoring");
      setStartedAt(Date.now());
      setExternalMode(true);
      setPublisherConnected(true);
    }
  }, [
    streamLoading,
    streamEntity,
    streamKeyValue,
    tokenId,
    streamKey,
    navigation,
  ]);

  // Network offline detection: show warning but do NOT end the stream.
  // The backend grace period (90s) handles temporary disconnections.
  // If the streamer reconnects within the grace window, Livepeer will
  // fire stream.started → backend resumes → viewers see stream.resumed.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected === false || state.isInternetReachable === false) {
        if (stage === "live" || stage === "starting") {
          console.log(
            "[LiveProducer] network offline detected -> stream will be paused by backend grace period"
          );
          toastInfo("Network lost — stream paused. Reconnecting…");
        }
      }
    });
    return () => unsub();
  }, [stage]);

  const onGlobalPress = useCallback(() => {
    bumpUiTimer();
  }, [bumpUiTimer]);

  // console.log({stage, streamKeyValue})

  return (
    <Pressable
      onPressIn={onGlobalPress}
      className="flex-1"
      android_disableSound
    >
      <View className="flex-1 bg-black">
        {/* Tiered Tip Animations Overlay */}
        <TipAnimationsOverlay items={tipEffects} />
        {/* Floating Reaction Bubbles */}
        <ReactionOverlay reactions={reactions} onRemove={removeReaction} />
        {/* Publisher area or skeleton placeholder for instant open */}
        {redirecting ? (
          <View className="absolute inset-0 items-center justify-center">
            <Text className="text-white/70 text-xs">Opening viewer…</Text>
          </View>
        ) : mountPublisher ? (
          <WebRTCPublisher
            streamKey={streamKey || streamKeyValue || ""}
            active={stage === "starting" || stage === "live"}
            facing={cameraFacing}
            micMuted={micMuted}
            cameraOff={cameraOff}
            onStats={(s) => setPublishStats(s)}
            onConnected={() => {
              console.log("[LiveProducer] WebRTC connected");
              setPublisherConnected(true);
            }}
            onError={(err) => {
              console.log(
                "[LiveProducer] WebRTCPublisher error escalated:",
                err
              );
              publisherFailed?.(err);
              setPublisherConnected(false);
              setCameraOff(true);
              if (stage === "live" || stage === "starting") {
                end().catch(() => {});
              }
            }}
            debug={true}
          />
        ) : (
          <View className="absolute inset-0 px-6 py-8">
            <View className="flex-1 rounded-2xl bg-white/5 border border-white/10 overflow-hidden" />
            <View className="mt-3 h-8 w-40 rounded-full bg-white/10" />
            <View className="mt-2 h-4 w-28 rounded-full bg-white/5" />
          </View>
        )}

        {/* Overlay: External mode */}
        {externalMode && (
          <View className="absolute inset-0 bg-zinc-900 items-center justify-center">
            <ExternalStreamingOverlay
              streamKeyValue={streamKeyValue}
              streamKeyLoading={streamKeyLoading}
              onExitExternal={() => setExternalMode(false)}
            />
          </View>
        )}

        {/* Overlay: Permission not granted */}
        {!permission?.granted && (
          <View className="absolute inset-0 bg-black/80 items-center justify-center">
            {!uiHidden && (
              <>
                <Text className="text-zinc-400 mb-3">
                  Camera permission required
                </Text>
                <TouchableOpacity
                  onPress={requestPermission}
                  className="px-4 py-2 rounded-full bg-white/10"
                >
                  <Text className="text-white text-xs">Grant Permission</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <ProducerStatusBar
          stage={stage}
          startTimestamp={startedAt}
          bitrateKbps={publishStats.bitrateKbps || 3200}
          viewers={typeof liveViewers === "number" ? liveViewers : 0}
          peakViewers={typeof peakViewers === "number" ? peakViewers : 0}
          likes={
            liveLikes || streamEntity?.likes || streamEntity?.likesCount || 0
          }
          micMuted={micMuted}
          cameraOff={cameraOff}
          // Starting substatus hinting
          startingHint={
            stage === "starting"
              ? publisherConnected
                ? "Waiting for Livepeer…"
                : externalMode
                ? "Waiting for external source…"
                : "Setting up publisher…"
              : undefined
          }
          onRequestClose={requestClose}
          onRequestEndConfirmation={openEndConfirm}
        />

        {/* Stream paused overlay with countdown */}
        {streamPaused && stage === "live" && (
          <View className="absolute inset-0 z-30 items-center justify-center bg-black/70" pointerEvents="box-none">
            <View className="bg-theme-neutrals-900/90 rounded-2xl px-6 py-5 items-center border border-white/10 mx-8">
              <Text className="text-yellow-400 text-2xl mb-2">⏸</Text>
              <Text className="text-white font-semibold text-sm">Connection Interrupted</Text>
              <Text className="text-white/70 text-xs mt-1 text-center">Your stream is paused. Reconnecting…</Text>
              {graceCountdown > 0 && (
                <View className="mt-3 items-center">
                  <Text className="text-white font-bold text-2xl">
                    {Math.floor(graceCountdown / 60)}:{String(graceCountdown % 60).padStart(2, '0')}
                  </Text>
                  <Text className="text-white/50 text-[10px] mt-1">Stream will end if not reconnected</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Scheduled stream banner (when status is SCHEDULED and not yet live) */}
        {isScheduled && stage !== "live" && stage !== "starting" && !uiHidden && (
          <View className="absolute top-16 left-4 right-4 z-30" pointerEvents="none">
            <View className="bg-indigo-600/80 rounded-xl px-4 py-2 items-center">
              <Text className="text-white font-semibold text-xs">📅 Scheduled Stream</Text>
              {scheduledForDate && (
                <Text className="text-white/80 text-[10px] mt-0.5">
                  Scheduled for {scheduledForDate.toLocaleDateString()} at {scheduledForDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}
              <Text className="text-white/70 text-[10px] mt-0.5">Press Go Live when ready to start broadcasting</Text>
            </View>
          </View>
        )}

        {/* Side chat panel (overlay) */}
        {chatVisible && !uiHidden && (
          <LiveChatPanel
            streamId={streamId || streamEntity?._id || ""}
            live={stage === "live"}
            visible
            onClose={() => setChatVisible(false)}
            chatEnabled={liveChatEnabled}
            phase={stage === 'live' ? 'live' : isScheduled ? 'scheduled' : 'ended'}
            autoJoinRoom={false}
            socketEmit={(evt, payload, ack) =>
              socketEmitAuthed(evt, payload, ack)
            }
            activities={chatActivities}
            addActivity={addChatActivity}
            // status bar is top-4 with rounded container (~56px), controls bar has p-4 pb-6 (~96px)
            topOffset={24 + 40} // account for top-4 + status card height padding
            bottomOffset={120 + 76} // account for controls padding and buttons
            onEphemeral={(m) => {
              // adapt to ChatMessage shape
              addEphemeral({
                id: m.id,
                user: m.user,
                message: m.message,
                createdAt: m.createdAt,
              } as any);
            }}
          />
        )}

        {/* Metadata overlay (bottom-left) */}
        {(!uiHidden || externalMode) && (
          <MetadataCard
            ref={metaCardRef}
            loading={streamLoading}
            streamEntity={streamEntity}
            streamId={streamId}
            onPress={openDetails}
          />
        )}

        <StreamDetailsTooltip
          visible={showDetailsModal && !uiHidden}
          sourceRect={sourceRect}
          streamEntity={streamEntity}
          streamKeyValue={streamKeyValue}
          streamKeyLoading={streamKeyLoading}
          streamKeyError={streamKeyError}
          onClose={closeDetails}
          onInteract={registerActivity}
        />

        {!uiHidden && (
          <ProducerControlsBar
            stage={stage}
            onStart={onStart}
            onEnd={onEnd}
            onToggleChat={() => {
              const next = !chatVisible;
              console.log(
                "[LiveProducer] toggleChat ->",
                next,
                "stage:",
                stage
              );
              if (next && stage !== "live") {
                console.log(
                  "[LiveProducer] Chat opened while not live; messages hidden."
                );
              }
              setChatVisible(next);
            }}
            chatVisible={chatVisible}
            hasUnseenChats={false}
            micMuted={micMuted}
            cameraOff={cameraOff}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            onFlipCamera={flipCamera}
            externalMode={externalMode}
            onToggleExternal={toggleExternal}
            startDisabled={!streamKeyValue || !streamEntity?.livepeerId}
            chatEnabled={liveChatEnabled}
            onToggleChatEnabled={handleToggleLiveChat}
          />
        )}

        {stage === "live" && (
          <EphemeralMessages
            messages={ephemeral}
            fadeAnim={fadeAnim}
            onPress={() => {
              setChatVisible(true);
              // setHasUnseenChats(false);
              bumpUiTimer();
            }}
          />
        )}

        <GlassModal
          visible={showEndConfirm}
          onClose={closeEndConfirm}
          backdropScope="panel"
        >
          <View className="mx-8 p-6">
            <Text className="text-white font-semibold text-base mb-2">
              End Stream?
            </Text>
            <Text className="text-white/70 text-xs leading-5 mb-5">
              Closing now will end your live stream for all viewers. You can
              continue streaming or end it permanently.
            </Text>
            <View className="flex-row justify-end">
              <TouchableOpacity
                onPress={closeEndConfirm}
                className="px-4 h-10 rounded-full items-center justify-center bg-white/10 mr-3"
                activeOpacity={0.85}
              >
                <Text className="text-white text-xs font-semibold">
                  Continue
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  closeEndConfirm();
                  onEnd();
                }}
                className="px-5 h-10 rounded-full items-center justify-center bg-red-600"
                activeOpacity={0.9}
              >
                <Text className="text-white text-xs font-semibold">
                  End Stream
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassModal>
      </View>
    </Pressable>
  );
};

export default LiveProducerScreen;
