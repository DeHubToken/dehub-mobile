import React, { useCallback, useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  InteractionManager,
  StatusBar,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import NetInfo from "@react-native-community/netinfo";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLive } from "../hooks/use-live";
import { useWebSocket } from "../context/WebSocketContext";
import { useCameraPermissions } from "expo-camera";
import WebRTCPublisher from "../components/LiveProducer/WebRTCPublisher";
import VideoLookSheet from "../components/LiveProducer/VideoLookSheet";
import {
  videoLooksSupported,
  type VideoLookId,
} from "../components/LiveProducer/videoLooks";
import ExternalStreamingOverlay from "../components/LiveProducer/ExternalStreamingOverlay";
import TipAnimationsOverlay from "../components/LiveProducer/TipAnimationsOverlay";
import ReactionOverlay from "../components/LiveProducer/ReactionOverlay";
import LiveEventBanner from "../components/LiveViewer/LiveEventBanner";
import type { EventBannerData } from "../components/LiveViewer/LiveEventBanner";
import ProducerHeader from "../components/LiveProducer/ProducerHeader";
import ProducerFloatingChat from "../components/LiveProducer/ProducerFloatingChat";
import ProducerBottomBar from "../components/LiveProducer/ProducerBottomBar";
import ProducerShopButton from "../components/LiveProducer/ProducerShopButton";
import StreamDetailsTooltip from "../components/LiveProducer/StreamDetailsTooltip";
import { useTipAnimations } from "../hooks/useTipAnimations";
import { useReactions } from "../hooks/useReactions";
import { useStreamDetails } from "../hooks/useStreamDetails";
import GlassModal from "../components/ui/GlassModal";
import { LivestreamEvents, StreamActivityType } from "../services/enums/livestream.enum";
import { toastSuccess, toastError, toastInfo } from "../libs/toast";
import { ScreenNames } from "../navigation/ScreenNames";
import { createViewCountUpdater, seedViewerStats } from "../libs/viewers.util";
import { updateStreamSettings } from "../services/live.service";
import { deletePost } from "../services/nft.service";
import { useUser, useAuthState } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";

type RouteParams = {
  streamId?: string;
  tokenId?: number;
  ingestUrl?: string;
  streamKey?: string;
  /**
   * Set by useUploadLive for an immediate (non-scheduled) launch: leaving the
   * producer without ever airing discards the freshly minted post instead of
   * stranding a dead live card in the feed.
   */
  discardIfNeverLive?: boolean;
};

/*
 * When the outgoing picture counts as starved.
 *
 * Under about five frames a second a viewer is watching a slideshow, not a
 * stream; under ~150 kbit/s the encoder has abandoned the picture to protect
 * the voice, which is what WebRTC gives up first. Deliberately far below
 * "not great" — this is for a broadcast that is failing, not a soft one.
 */
const STARVED_FPS = 5;
const STARVED_KBPS = 150;
/** Consecutive bad samples before it is called (2s each — see WebRTCPublisher). */
const STARVED_SAMPLES = 2;

const LiveProducerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const { streamId, tokenId, ingestUrl, streamKey, discardIfNeverLive } =
    (route.params || {}) as RouteParams;
  const {
    on: socketOn,
    emitAuthed: socketEmitAuthed,
    connected,
  } = useWebSocket();
  // console.log("LiveProducers", { connected });
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // Legacy simulated messages removed; real chat handled inside ProducerFloatingChat
  const [startedAt, setStartedAt] = useState<number | null>(null);
  // Unseen chat badge removed (panel itself can manage highlighting later)
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [externalMode, setExternalMode] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<"front" | "back">("front");
  const [videoLook, setVideoLook] = useState<VideoLookId>("none");
  const [looksOpen, setLooksOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const {
    streamEntity,
    streamLoading,
    streamError,
    streamKeyValue,
    streamKeyLoading,
    streamKeyError,
  } = useStreamDetails(streamId);
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
  const [sourceRect, setSourceRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const uiTimerRef = useRef<NodeJS.Timeout | null>(null);
  const insets = useSafeAreaInsets();
  const {
    items: tipEffects,
    enqueueFromGift,
    clearAll,
  } = useTipAnimations({ maxConcurrent: 2 });
  const { reactions, addReaction, removeReaction, clearReactions } = useReactions();
  // Stream paused/resumed state
  const [streamPaused, setStreamPaused] = useState(false);
  // Grace period countdown for PAUSED state
  const [graceCountdown, setGraceCountdown] = useState<number>(0);
  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Centralized chat activity list for ProducerFloatingChat
  const [chatActivities, setChatActivities] = useState<
    Array<{
      status: any;
      address?: string;
      createdAt?: number;
      meta?: any;
      optimistic?: boolean;
      user?: any;
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

  // TikTok-style join / gift banners
  const [joinEvent, setJoinEvent] = useState<EventBannerData | null>(null);
  const [giftEvent, setGiftEvent] = useState<(EventBannerData & { amount: number; message?: string }) | null>(null);

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
        // REST activities carry `account` as the userReferenceProjection
        user: it?.account || it?.user || undefined,
        meta: it?.meta || it?.message?.meta || {
          username: it?.user?.username || it?.account?.username,
          content: it?.message?.content,
          amount: it?.gift?.meta?.amount,
          avatarImageUrl: it?.user?.avatarImageUrl || it?.account?.avatarImageUrl,
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
      // Prefer nested user/account ref for rich profile data
      const tipUserRef = gift?.user || gift?.account || payload?.user || undefined;
      const tipUsername = tipUserRef?.displayName || tipUserRef?.username || gift?.meta?.username || gift?.meta?.displayName;
      // Enqueue visual effect per tier
      enqueueFromGift({
        amount: gift?.meta?.amount,
        message: gift?.meta?.message,
        username: tipUsername,
        selectedTier: gift?.meta?.selectedTier,
      } as any);
      // Update gift banner
      setGiftEvent({ id: `${Date.now()}-${tipUserRef?.address || tipUsername}`, displayName: tipUsername || '', avatarUrl: tipUserRef?.avatarImageUrl, amount: amt, message: gift?.meta?.message });
      addChatActivity({
        status: StreamActivityType.TIP,
        address: tipUserRef?.address || gift?.meta?.address,
        user: tipUserRef,
        meta: {
          username: tipUsername,
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
      // Prefer nested user object (userReferenceProjection), fallback to account
      const userRef = m?.user || m?.account || payload?.user || payload?.account || undefined;
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
            copy[idx] = { ...existing, optimistic: false, user: userRef || existing.user } as any;
            return copy;
          }
          return prev;
        });
        return;
      }
      addChatActivity({
        status: StreamActivityType.MESSAGE,
        address: addr,
        user: userRef,
        meta: {
          username,
          content,
          avatarImageUrl: userRef?.avatarImageUrl || meta?.avatarImageUrl,
        },
      });
    });
    make(LivestreamEvents.JoinStream, (data: any) => {
      const userRef = data?.user || data?.account || undefined;
      const joinName = userRef?.displayName || userRef?.username || data?.username || '';
      const joinAvatar = userRef?.avatarImageUrl;
      setJoinEvent({ id: `${Date.now()}-${joinName}`, displayName: joinName, avatarUrl: joinAvatar });
      addChatActivity({
        status: StreamActivityType.JOINED,
        address: userRef?.address || data?.address,
        user: userRef,
        meta: {
          username: userRef?.username || data?.username,
          avatarImageUrl: userRef?.avatarImageUrl,
        },
      });
    });
    make(LivestreamEvents.LeaveStream, (data: any) => {
      const userRef = data?.user || data?.account || undefined;
      addChatActivity({
        status: StreamActivityType.LEFT,
        address: userRef?.address || data?.address,
        user: userRef,
        meta: {
          username: userRef?.username || data?.username,
          avatarImageUrl: userRef?.avatarImageUrl,
        },
      });
    });
    // Reaction events from viewers
    make(LivestreamEvents.StreamReaction, (data: any) => {
      // Backend sends { reactionType, user: <userRef> }
      const type = data?.reactionType as import('../components/LiveProducer/ReactionOverlay').ReactionType;
      const username = data?.user?.displayName || data?.user?.username;
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

  // Whether this stream ever actually aired — stage reached 'live' from this
  // device, or it was already LIVE on load (external encoder). An immediate
  // launch that never did leaves a post advertising a stream nobody can ever
  // watch, so every exit path discards it with the same soft delete the card
  // menu runs. discardIfNeverLive comes from useUploadLive and is false for
  // scheduled streams, which legitimately exist before they air.
  const everLiveRef = useRef(false);
  const discardedRef = useRef(false);
  const discardDeadLaunch = () => {
    if (!discardIfNeverLive || everLiveRef.current || discardedRef.current) return;
    // Belt and braces: if the backend saw this stream air at all (an encoder
    // pointed at the ingest out-of-band counts), the post stays.
    const backendStatus = (
      (streamEntity as any)?.status as string | undefined
    )?.toLowerCase();
    if (
      backendStatus === "live" ||
      backendStatus === "paused" ||
      backendStatus === "ended"
    )
      return;
    const tid = tokenId ?? (streamEntity as any)?.tokenId;
    if (tid == null) return;
    discardedRef.current = true;
    console.log("[LiveProducer] discarding never-aired live post", tid);
    deletePost(tid).catch(() => {});
  };
  // Read through a ref so the unmount cleanup (whose closure is frozen at
  // mount) sees the current streamEntity/tokenId.
  const discardDeadLaunchRef = useRef(discardDeadLaunch);
  useEffect(() => {
    discardDeadLaunchRef.current = discardDeadLaunch;
  });

  const onStart = useCallback(() => {
    console.log("[LiveProducer] onStart invoked. Current stage:", stage);
    // Mark that this device started the stream
    startedFromThisDeviceRef.current = true;
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
    // Mark ended so the stage-transition effect doesn't also toast + goBack
    endedRef.current = true;
    discardDeadLaunchRef.current();
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
    discardDeadLaunchRef.current();
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

  // Send chat message from floating chat
  const handleSendChatMessage = useCallback((content: string) => {
    if (!content || stage !== "live") return;
    const tempId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    addChatActivity({
      status: StreamActivityType.MESSAGE,
      address: (user as any)?.address,
      meta: { username: (user as any)?.username || "You", content, tempId },
      createdAt: Date.now(),
      optimistic: true,
    });
    socketEmitAuthed(LivestreamEvents.SendMessage, {
      streamId: streamId || (streamEntity as any)?._id,
      content,
    });
  }, [stage, user, addChatActivity, socketEmitAuthed, streamId, streamEntity]);

  const openEndConfirm = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const closeEndConfirm = useCallback(() => setShowEndConfirm(false), []);

  const handleConfirmEnd = useCallback(() => {
    closeEndConfirm();
    onEnd();
  }, [closeEndConfirm, onEnd]);

  // WebRTC publisher callbacks (stable refs to avoid anonymous fns in JSX)
  const handlePublishStats = useCallback(
    (s: { fps?: number; bitrateKbps?: number; dropped?: number }) => {
      setPublishStats(s);
    },
    []
  );

  const handlePublisherConnected = useCallback(() => {
    console.log("[LiveProducer] WebRTC connected");
    setPublisherConnected(true);
  }, [setPublisherConnected]);

  const handlePublisherError = useCallback(
    (err: any) => {
      console.log("[LiveProducer] WebRTCPublisher error escalated:", err);
      publisherFailed?.(typeof err === "string" ? err : err?.message || "Publisher error");
      setPublisherConnected(false);
      setCameraOff(true);
      if (stage === "live" || stage === "starting") {
        end().catch(() => {});
      }
    },
    [publisherFailed, setPublisherConnected, stage, end]
  );

  const handleExitExternal = useCallback(() => {
    setExternalMode(false);
  }, []);

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
    // Position the tooltip near the top of the screen (below header)
    setSourceRect({ x: 16, y: insets.top + 80, width: 200, height: 30 });
    setShowDetailsModal(true);
  }, [streamEntity, insets.top]);

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

  // UI inactivity hide (controls auto-hide after 5s inactivity)
  const bumpUiTimer = useCallback(() => {
    setUiHidden(false);
    if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    uiTimerRef.current = setTimeout(() => {
      setUiHidden(true);
      setShowDetailsModal(false);
    }, 5000);
  }, []);

  useEffect(() => {
    bumpUiTimer();
    return () => {
      if (uiTimerRef.current) clearTimeout(uiTimerRef.current);
    };
  }, [bumpUiTimer]);

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
    if (stage === "live") everLiveRef.current = true;
    // On ended, notify and leave the screen automatically
    // Guard with endedRef so the toast only fires once (not also from onEnd)
    if (stage === "ended" && !endedRef.current) {
      endedRef.current = true;
      discardDeadLaunchRef.current();
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

  /*
   * Whether viewers are getting a picture at all.
   *
   * The preview on this screen is the CAMERA, not the broadcast, so it stays
   * perfect while the encoder starves — and a host has no way to tell the two
   * apart. A web broadcast on 2026-09-01 published 74 frames in 77 seconds at
   * ~37 kbit/s: its one viewer watched a frozen frame, left after seventeen
   * seconds, and the console showed a healthy stream the whole time. The kbps
   * readout was already here; what it lacked was anything saying that number
   * is bad.
   *
   * Two consecutive samples before it is called (2s each) — a keyframe request
   * or a camera flip dips briefly, and a warning that blinks on every hiccup
   * is one a host learns to ignore. A camera the host switched off sends
   * nothing and is not a fault.
   */
  const [starved, setStarved] = useState(false);
  const badStatsRef = useRef(0);
  useEffect(() => {
    if (stage !== "live" || cameraOff) {
      badStatsRef.current = 0;
      setStarved(false);
      return;
    }
    const { fps, bitrateKbps } = publishStats;
    if (typeof bitrateKbps !== "number") return;
    const bad =
      bitrateKbps < STARVED_KBPS || (typeof fps === "number" && fps < STARVED_FPS);
    badStatsRef.current = bad ? badStatsRef.current + 1 : 0;
    setStarved(badStatsRef.current >= STARVED_SAMPLES);
  }, [publishStats, stage, cameraOff]);

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
      // Navigating away without ever airing follows the same rule as an
      // explicit close: the post advertises a stream that never existed.
      discardDeadLaunchRef.current();
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
  // Also detect if the stream started externally (LIVE on load but we never pressed Go Live)
  const [redirecting, setRedirecting] = useState(false);
  const initialRedirectCheckedRef = useRef(false);
  // Track whether this producer actually started the stream from this device
  const startedFromThisDeviceRef = useRef(false);

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
      // Stream is already LIVE on load and we didn't start it from this device
      // → must have been started externally (OBS/streaming software)
      if (!startedFromThisDeviceRef.current) {
        console.log("[LiveProducer] stream already LIVE on load — entering external monitoring mode");
        // An externally started stream has aired by definition — it must
        // never be treated as a dead launch on exit.
        everLiveRef.current = true;
        const realStart = (streamEntity as any)?.startedAt
          ? new Date((streamEntity as any).startedAt).getTime()
          : Date.now();
        setStartedAt(realStart);
        setExternalMode(true);
        setPublisherConnected(true);
      }
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
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle="light-content"
      />
      <View className="flex-1 bg-black">
        {/* Full-screen camera/publisher as background */}
        <View className="absolute inset-0">
          {redirecting ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-white/70 text-xs">Opening viewer...</Text>
            </View>
          ) : mountPublisher ? (
            <WebRTCPublisher
              streamKey={streamKey || streamKeyValue || ""}
              playbackId={streamEntity?.playbackId}
              provider={(streamEntity as any)?.provider}
              active={
                (stage === "starting" || stage === "live") && !externalMode
              }
              facing={cameraFacing}
              micMuted={micMuted}
              cameraOff={cameraOff}
              videoLook={videoLook}
              onStats={handlePublishStats}
              onConnected={handlePublisherConnected}
              onError={handlePublisherError}
              debug={true}
            />
          ) : (
            <View className="flex-1 bg-zinc-900" />
          )}
        </View>

        {/* External streaming overlay */}
        {externalMode ? (
          <View className="absolute inset-0 bg-zinc-900 items-center justify-center z-10">
            <ExternalStreamingOverlay
              streamKeyValue={streamKeyValue}
              streamKeyLoading={streamKeyLoading}
              onExitExternal={handleExitExternal}
              isLive={stage === "live"}
            />
          </View>
        ) : null}

        {/* Permission overlay */}
        {!permission?.granted ? (
          <View className="absolute inset-0 bg-black/80 items-center justify-center z-20">
            <Text className="text-zinc-400 mb-3 text-sm">
              Camera permission required
            </Text>
            <TouchableOpacity
              onPress={requestPermission}
              className="px-5 py-2.5 rounded-full bg-white/10"
              activeOpacity={0.8}
            >
              <Text className="text-white text-xs font-medium">
                Grant Permission
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Overlay container */}
        <View className="absolute inset-0" pointerEvents="box-none">
          {/* Top gradient */}
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0)"]}
            style={{
              height: 100 + insets.top,
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
            }}
            pointerEvents="none"
          />

          {/* Bottom gradient — now the only thing holding the chat up. The
              messages lost their per-line bubbles, so this shade is what makes
              them readable over a bright frame: it starts higher and ramps
              through a mid stop so the top of the message column is already
              sitting on something. */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.45)", "rgba(0,0,0,0.85)"]}
            locations={[0, 0.5, 1]}
            style={{
              height: 420,
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
            }}
            pointerEvents="none"
          />

          {/* Main layout */}
          <View className="flex-1" pointerEvents="box-none">
            <View className="flex-1" pointerEvents="box-none">
              {/* Header: LIVE status, timer, viewers, close */}
              {!uiHidden ? (
                <ProducerHeader
                  stage={stage}
                  startTimestamp={startedAt}
                  viewers={
                    typeof liveViewers === "number" ? liveViewers : 0
                  }
                  peakViewers={
                    typeof peakViewers === "number" ? peakViewers : 0
                  }
                  likes={
                    liveLikes ||
                    streamEntity?.likes ||
                    streamEntity?.likesCount ||
                    0
                  }
                  bitrateKbps={publishStats.bitrateKbps || 0}
                  starved={starved}
                  micMuted={micMuted}
                  cameraOff={cameraOff}
                  startingHint={
                    stage === "starting"
                      ? publisherConnected
                        ? "Waiting for Livepeer..."
                        : externalMode
                        ? "Waiting for external source..."
                        : "Setting up publisher..."
                      : undefined
                  }
                  onRequestClose={requestClose}
                  onRequestEndConfirmation={openEndConfirm}
                />
              ) : null}

              {/* Scheduled banner */}
              {isScheduled &&
              stage !== "live" &&
              stage !== "starting" &&
              !uiHidden ? (
                <View
                  className="mx-4 mt-1"
                  pointerEvents="none"
                >
                  <View className="bg-indigo-600/70 rounded-xl px-4 py-2.5 items-center border border-indigo-400/20">
                    <Text className="text-white font-semibold text-xs">
                      {"Scheduled Stream"}
                    </Text>
                    {scheduledForDate ? (
                      <Text className="text-white/80 text-[10px] mt-0.5">
                        {scheduledForDate.toLocaleDateString()} at{" "}
                        {scheduledForDate.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </Text>
                    ) : null}
                    <Text className="text-white/60 text-[10px] mt-0.5">
                      Press Go Live when ready to start
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Stream title overlay (tap to see stream details) */}
              {!uiHidden && streamEntity?.title ? (
                <TouchableOpacity
                  className="px-4 mt-2"
                  activeOpacity={0.7}
                  onPress={openDetails}
                >
                  <Text
                    className="text-white text-sm font-semibold"
                    numberOfLines={1}
                    style={{
                      textShadowColor: "rgba(0,0,0,0.8)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {streamEntity.title}
                  </Text>
                  {streamEntity.description ? (
                    <Text
                      className="text-white/60 text-[11px] mt-0.5"
                      numberOfLines={1}
                    >
                      {streamEntity.description}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : null}

              {/* Middle spacer */}
              <View className="flex-1" pointerEvents="box-none" />

              {/* Bottom section: Chat + Controls */}
              <View
                pointerEvents="box-none"
                style={{ paddingBottom: Math.max(insets.bottom, 8) }}
              >
                {/* TikTok-style join/gift banners */}
                <LiveEventBanner joinEvent={joinEvent} giftEvent={giftEvent} />

                {/* Shop controls — attach listings and put one on air without
                    leaving the broadcast. Right-aligned above the chat so it
                    stays clear of the message column. */}
                <View className="flex-row justify-end px-3 mb-2" pointerEvents="box-none">
                  <ProducerShopButton
                    tokenId={tokenId || (streamEntity as any)?.tokenId}
                    visible={!uiHidden}
                  />
                </View>

                {/* Floating chat messages + input */}
                <ProducerFloatingChat
                  activities={chatActivities}
                  isLive={stage === "live"}
                  chatEnabled={liveChatEnabled}
                  canSend={stage === "live" && liveChatEnabled}
                  onSendMessage={handleSendChatMessage}
                  onToggleChatEnabled={
                    stage === "live" ? handleToggleLiveChat : undefined
                  }
                  settingsUpdating={settingsUpdating}
                />

                {/* Controls: flip, mic, camera, go live / end */}
                {!uiHidden ? (
                  <View className="mt-3">
                    <ProducerBottomBar
                      stage={stage}
                      onStart={onStart}
                      onEnd={onEnd}
                      micMuted={micMuted}
                      cameraOff={cameraOff}
                      onToggleMic={toggleMic}
                      onToggleCamera={toggleCamera}
                      onFlipCamera={flipCamera}
                      externalMode={externalMode}
                      onToggleExternal={toggleExternal}
                      startDisabled={
                        !streamKeyValue || !streamEntity?.livepeerId
                      }
                      {...(videoLooksSupported && !externalMode
                        ? {
                            onOpenLooks: () => setLooksOpen(true),
                            looksActive: videoLook !== "none",
                          }
                        : null)}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Floating Reaction Bubbles */}
          <ReactionOverlay reactions={reactions} onRemove={removeReaction} />

          {/* Tip Animations Overlay */}
          <TipAnimationsOverlay items={tipEffects} />

          {/* Stream paused overlay with countdown */}
          {streamPaused && stage === "live" ? (
            <View
              className="absolute inset-0 z-30 items-center justify-center bg-black/70"
              pointerEvents="box-none"
            >
              <View className="bg-black/80 rounded-xl px-6 py-5 items-center border border-white/10 mx-8">
                <Text className="text-yellow-400 text-2xl mb-2">{"⏸"}</Text>
                <Text className="text-white font-semibold text-sm">
                  Connection Interrupted
                </Text>
                <Text className="text-white/70 text-xs mt-1 text-center">
                  {"Your stream is paused. Reconnecting..."}
                </Text>
                {graceCountdown > 0 ? (
                  <View className="mt-3 items-center">
                    <Text className="text-white font-bold text-2xl">
                      {Math.floor(graceCountdown / 60)}:
                      {String(graceCountdown % 60).padStart(2, "0")}
                    </Text>
                    <Text className="text-white/50 text-[10px] mt-1">
                      Stream will end if not reconnected
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {/* Stream details tooltip */}
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

        {/* End stream confirmation */}
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
                onPress={handleConfirmEnd}
                className="px-5 h-10 rounded-xl items-center justify-center bg-white/15 border border-white/25"
                activeOpacity={0.9}
              >
                <Text className="text-white text-xs font-semibold">
                  End Stream
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </GlassModal>

        {/* Camera looks. Rendered last so it sits over the preview, and only
            where native processors exist to back it. */}
        {videoLooksSupported ? (
          <VideoLookSheet
            visible={looksOpen}
            active={videoLook}
            onSelect={setVideoLook}
            onClose={() => setLooksOpen(false)}
          />
        ) : null}
      </View>
    </Pressable>
  );
};

export default LiveProducerScreen;