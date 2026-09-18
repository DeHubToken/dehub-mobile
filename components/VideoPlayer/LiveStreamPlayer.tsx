import { hasStreamEnded } from '../../libs/live-status';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  Platform,
  AppState,
  BackHandler,
  StatusBar,
} from "react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { createLiveViewerOrientation } from "../../libs/live-viewer-orientation";
import VideoArea from "./VideoArea";
import { useUser, useAuthState, useAuthActions } from "../../context/AuthContext";
import { useStreamAccessInfo } from "../../libs/validators.util";
import {
  followUser,
  unfollowUser,
} from "../../services/user.service";
import { LinearGradient } from "expo-linear-gradient";
import ReactionOverlay from "../LiveProducer/ReactionOverlay";
import TipAnimationsOverlay from "../LiveProducer/TipAnimationsOverlay";
import GiftModal from "../Tip/GiftModal";
import StreamShopOverlay from "../LiveViewer/StreamShopOverlay";
import ShopBoard from "../common/ShopBoard";
import { useTipAnimations } from "../../hooks/useTipAnimations";
import { useReactions } from "../../hooks/useReactions";
import type { ReactionType } from "../LiveProducer/ReactionOverlay";
import { useWebSocket } from "../../context/WebSocketContext";
import {
  LivestreamEvents,
  StreamActivityType,
  StreamStatus,
} from "../../services/enums/livestream.enum";
import { toastError } from "../../libs";
import { useStreamDetails } from "../../hooks/useStreamDetails";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { createViewCountUpdater, seedViewerStats } from "../../libs/viewers.util";
import { likeLiveStream } from "../../services/live.service";
import { shareProfile } from "../../libs/misc";
import { WEBSITE_LINK } from "../../config";
import LiveViewerHeader from "../LiveViewer/LiveViewerHeader";
import LiveViewerChat from "../LiveViewer/LiveViewerChat";
import LiveViewerActionBar from "../LiveViewer/LiveViewerActionBar";
import LiveViewerPills from "../LiveViewer/LiveViewerPills";
import LiveViewerStatusOverlay from "../LiveViewer/LiveViewerStatusOverlay";
import LiveEventBanner from "../LiveViewer/LiveEventBanner";
import type { EventBannerData } from "../LiveViewer/LiveEventBanner";
import { hlsUrlFor } from "../../libs/live-ingest";
import { useWhepStream } from "../../hooks/useWhepStream";
import LiveWebRtcView from "../LiveViewer/LiveWebRtcView";
import { DeHubLoader } from "../DeHubLoader";
import { extractReplayUrl } from "../../libs/live-replay";
import PostOptionsMenu from "../common/PostOptionsMenu";
import LiveViewerPlayerControls from "../LiveViewer/LiveViewerPlayerControls";
import { useLiveChat } from "../../hooks/useLiveChat";
import { useLivePostReactions } from "../../hooks/useLivePostReactions";
import { useTranslation as useCopy } from "react-i18next";
import { EDGE } from "../common/ViewerChrome";
import { speakTipMessage, setTipTtsEnabled } from "../../libs/tipTts";
import { TipSpeaker } from "../Live/TipSpeaker";
import ViewerScrubBar from "../common/ViewerScrubBar";
import { useSharedValue } from "react-native-reanimated";

type LiveStreamPlayerProps = {
  // Minimal inputs; additional params may be forwarded from route
  tokenId?: string | number;
  streamId?: string;
  streamKey?: string;
  playbackId?: string; // for HLS playback
  nft?: any; // optional preloaded NFT/meta (unused for live viewer)
  accessInfo?: any; // optional precomputed access
  title?: string;
  description?: string;
  minter?: string;
  createdAt?: string | number | Date;
};

// Resolved from the stream, not hardcoded: a broadcast may be on Livepeer or
// on the self-hosted ingest, and the two put the playback id in completely
// different places. Assuming Livepeer here is what would make every
// self-hosted stream 404 on this app while working everywhere else.
const buildHlsFromPlayback = (
  playbackId?: string | null,
  provider?: string | null,
) => hlsUrlFor({ playbackId, provider });

const LiveStreamPlayer: React.FC<LiveStreamPlayerProps> = (props) => {
  const [viewportHeight, setViewportHeight] = useState(0);
  const {
    tokenId,
    streamId: streamIdProp,
    playbackId: playbackIdProp,
    nft: nftProp,
    accessInfo: accessInfoProp,
    title: titleProp,
    description: descProp,
    minter: minterProp,
    createdAt: createdAtProp,
  } = props;
  const user = useUser();
  const { t } = useCopy();
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const {
    on: socketOn,
    emitAuthed: socketEmitAuthed,
    connected,
  } = useWebSocket();
  const navigation = useNavigation<any>();

  // Refs for cleanup closures — always read latest values, never stale
  const socketEmitRef = useRef(socketEmitAuthed);
  useEffect(() => { socketEmitRef.current = socketEmitAuthed; }, [socketEmitAuthed]);
  const streamIdRef = useRef<string | null>(null);
  const isSignedInRef = useRef(isSignedIn);
  useEffect(() => { isSignedInRef.current = isSignedIn; }, [isSignedIn]);

  // Resolve streamId for fetching livestream details (prefer explicit prop)
  const resolvedStreamId = useMemo(() => {
    return (streamIdProp || null) as string | null;
  }, [streamIdProp]);

  // Fetch livestream details (structure differs from NFT)
  const { streamEntity, streamLoading, refetchStream } = useStreamDetails(
    resolvedStreamId || undefined,
    false
  );

  const accessInput = useMemo(() => {
    if (streamEntity) {
      return {
        tokenId: streamEntity.tokenId,
        minter: streamEntity.address,
        streamInfo: streamEntity.streamInfo,
        // Without these the creator's own stream reads as locked to them, and
        // a PPV already paid for asks to be paid for again.
        isOwner: (streamEntity as any).isOwner,
        isUnlocked: (streamEntity as any).isUnlocked,
        plansDetails: (streamEntity as any).plansDetails,
      } as any;
    }
    return undefined as any;
  }, [streamEntity]);
  const accessComputed = useStreamAccessInfo(accessInput);
  const resolvedAccessInfo = accessComputed?.streamStatus
    ? accessComputed
    : accessInfoProp;
  const isFree = resolvedAccessInfo?.streamStatus?.isFree === true;
  const isLockedOrPPV = !!(
    resolvedAccessInfo?.streamStatus && !resolvedAccessInfo.streamStatus.isFree
  );
  const isPlayable = useMemo(() => {
    const st = resolvedAccessInfo?.streamStatus;
    if (!st) return isFree;
    return (
      !st.isLockedWithLockContent &&
      !st.isLockedWithPPV &&
      !st.isLockedWithSubscription
    );
  }, [resolvedAccessInfo, isFree]);

  // Creator/channel state — seeded from streamEntity.account (no extra fetch needed)
  const [creatorLoading, setCreatorLoading] = useState<boolean>(true);
  const [creator, setCreator] = useState<any | null>(null);
  // Seed from nft prop (passed from feed card) so follow state is correct immediately
  const [isFollowing, setIsFollowing] = useState<boolean>(
    !!((props as any).nft?.isFollowing)
  );
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  useEffect(() => {
    if (!streamEntity) return;
    const account = (streamEntity as any)?.account || null;
    if (account) setCreator(account);
    // Only seed isFollowing from streamEntity when no nft prop was passed (e.g. deep link)
    if (typeof (streamEntity as any)?.isFollowing === 'boolean' && !nftProp) {
      setIsFollowing((streamEntity as any).isFollowing);
    }
    setCreatorLoading(false);
  }, [streamEntity, nftProp]);

  const handleFollow = useCallback(() => {
    if (!creator || isFollowing) return;
    const viewer = (user?.walletAddress || user?.address || "").toLowerCase();
    const target = (
      (creator?.walletAddress ||
        creator?.address ||
        creator?.username ||
        "") as string
    ).toLowerCase();
    if (!viewer || !target) return;
    requireAuth?.(async () => {
      setFollowLoading(true);
      setIsFollowing(true);
      try {
        await followUser(viewer, target);
      } catch (e) {
        setIsFollowing(false);
        toastError("Failed to follow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, user?.walletAddress, user?.address, requireAuth]);

  const handleUnfollow = useCallback(() => {
    if (!creator || !isFollowing || followLoading) return;
    const viewer = (user?.walletAddress || user?.address || "").toLowerCase();
    const target = (
      (creator?.walletAddress ||
        creator?.address ||
        creator?.username ||
        "") as string
    ).toLowerCase();
    if (!viewer || !target) return;
    requireAuth?.(async () => {
      setFollowLoading(true);
      setIsFollowing(false);
      try {
        await unfollowUser(viewer, target);
      } catch (e) {
        setIsFollowing(true);
        toastError("Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [creator, isFollowing, followLoading, user?.walletAddress, user?.address, requireAuth]);

  // Derive display fields
  const resolvedTitle = (streamEntity?.title ||
    titleProp ||
    "Live Stream") as string;
  const resolvedDescription = (streamEntity?.description ||
    descProp ||
    "") as string;
  const resolvedViews = ((streamEntity?.totalViews as number | undefined) ??
    0) as number; // live viewers might come via socket elsewhere
  const resolvedTotalTips = ((streamEntity?.totalTips as number | undefined) ??
    0) as number;
  const createdAtDate = useMemo(() => {
    if (createdAtProp) return new Date(createdAtProp);
    const fromStream =
      streamEntity?.startedAt ||
      streamEntity?.scheduledFor ||
      streamEntity?.createdAt;
    if (fromStream) return new Date(fromStream);
    return new Date(Date.now());
  }, [
    createdAtProp,
    streamEntity?.startedAt,
    streamEntity?.scheduledFor,
    streamEntity?.createdAt,
  ]);

  const endedAtDate = useMemo(() => {
    const fromStream =
      (streamEntity as any)?.endedAt || (streamEntity as any)?.ended || null;
    return fromStream ? new Date(fromStream) : null;
  }, [streamEntity]);

  const startedAtDate = useMemo(() => {
    const s = (streamEntity as any)?.startedAt;
    return s ? new Date(s) : null;
  }, [streamEntity]);

  const endedDurationText = useMemo(() => {
    if (!endedAtDate || !startedAtDate) return null;
    const ms = Math.max(0, endedAtDate.getTime() - startedAtDate.getTime());
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n: number) => n.toString().padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }, [endedAtDate, startedAtDate]);

  // Live chat activities and socket wiring
  type Activity = {
    id?: string;
    status: StreamActivityType | "SYSTEM";
    address?: string;
    createdAt: number;
    /** Full user reference from socket `user` / REST `account` field. */
    user?: import("../LiveViewer/LiveViewerChat").UserReference;
    meta?: any;
    optimistic?: boolean;
  };
  const [activities, setActivities] = useState<Activity[]>([]);

  // Tip animations (viewer sees same tiered effects as producer)
  const { items: tipEffects, enqueueFromGift, clearAll: clearTipEffects } = useTipAnimations({ maxConcurrent: 2 });
  // Floating reaction bubbles
  const { reactions, addReaction, removeReaction, clearReactions } = useReactions();
  // Stream paused/resumed state
  const [streamPaused, setStreamPaused] = useState(false);
  // Dynamic chat enabled (settings can change mid-stream)
  const [liveChatEnabled, setLiveChatEnabled] = useState(true);

  // TikTok-style join / gift banners (single-line, replaced on each new event)
  const [joinEvent, setJoinEvent] = useState<EventBannerData | null>(null);
  const [giftEvent, setGiftEvent] = useState<(EventBannerData & { amount: number; message?: string }) | null>(null);

  // Sync from initial entity
  useEffect(() => {
    const chatSetting = (streamEntity as any)?.settings?.chat?.enabled ??
      (streamEntity as any)?.settings?.enableChat;
    if (typeof chatSetting === 'boolean') setLiveChatEnabled(chatSetting);
    // Seed paused state if stream entity loaded as PAUSED
    const entityStatus = String((streamEntity as any)?.status || '').toUpperCase();
    if (entityStatus === 'PAUSED' && !streamPaused) {
      setStreamPaused(true);
      // Calculate remaining grace from pausedAt if available
      const pausedAt = (streamEntity as any)?.pausedAt;
      const defaultGrace = 90;
      if (pausedAt) {
        const elapsed = Math.floor((Date.now() - new Date(pausedAt).getTime()) / 1000);
        const remaining = Math.max(0, defaultGrace - elapsed);
        setGraceCountdown(remaining);
      } else {
        setGraceCountdown(defaultGrace);
      }
    }
  }, [streamEntity]);

  const addActivity = useCallback(
    (
      a: Partial<Activity> & {
        status: Activity["status"];
        meta?: any;
        address?: string;
        user?: Activity["user"];
      }
    ) => {
      const next: Activity = {
        id: a.id,
        status: a.status,
        address: a.address,
        createdAt: a.createdAt ?? Date.now(),
        user: a.user,
        meta: a.meta ?? {},
        optimistic: a.optimistic === true,
      };
      setActivities((prev: Activity[]) => {
        const merged: Activity[] = prev.concat(next);
        return merged.slice(-400) as Activity[];
      });
    },
    []
  );

  // Track recent optimistic chat messages for dedupe/confirm (15s window)
  const recentOptimisticRef = useRef<
    Array<{ key: string; idx?: number; ts: number }>
  >([]);
  const rememberOptimistic = useCallback((key: string, idx?: number) => {
    const now = Date.now();
    recentOptimisticRef.current = recentOptimisticRef.current
      .filter((it) => now - it.ts < 15000)
      .concat({ key, idx, ts: now })
      .slice(-50);
  }, []);
  const popRecentOptimistic = useCallback((key: string) => {
    const now = Date.now();
    recentOptimisticRef.current = recentOptimisticRef.current.filter(
      (it) => now - it.ts < 15000
    );
    const found = recentOptimisticRef.current.find((it) => it.key === key);
    return found;
  }, []);
  const streamId = useMemo(() => {
    return (resolvedStreamId || streamEntity?._id || null) as string | null;
  }, [resolvedStreamId, streamEntity?._id]);
  // Keep streamIdRef in sync
  useEffect(() => { streamIdRef.current = streamId; }, [streamId]);

  // Ownership/redirect gating for JoinStream
  const [ownerStatus, setOwnerStatus] = useState<
    "unknown" | "owner" | "viewer"
  >("unknown");
  const didJoinRef = useRef<boolean>(false);
  const didLeaveRef = useRef<boolean>(false);

  // Dedupe mechanics across reconnects: track connection epochs and per-epoch sends
  const connectedGenRef = useRef<number>(0);
  const prevConnectedRef = useRef<boolean>(false);
  const joinRoomSentKeyRef = useRef<string | null>(null);
  const joinStreamSentKeyRef = useRef<string | null>(null);
  const maybeJoinRoomRef = useRef<(sid?: string | null) => void>(() => {});
  const maybeJoinStreamRef = useRef<(sid?: string | null) => void>(() => {});

  // Compact meta row: status, elapsed, viewers, bitrate (if available)
  const rawStatus = (streamEntity?.status || "") as string;
  const statusUpper = rawStatus.toUpperCase() as
    | keyof typeof StreamStatus
    | string;
  const statusEnum = (Object.values(StreamStatus) as string[]).includes(
    statusUpper as string
  )
    ? (statusUpper as StreamStatus)
    : undefined;
  const isLiveStatus = statusEnum === StreamStatus.LIVE || statusEnum === StreamStatus.PAUSED;
  const isEndedStatus = hasStreamEnded(streamEntity);
  const scheduledForRaw: any = (streamEntity as any)?.scheduledFor;
  const scheduledForDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
  const isScheduledStatus =
    statusEnum === StreamStatus.SCHEDULED ||
    (!!scheduledForDate && scheduledForDate.getTime() > Date.now());

  // Socket-driven overrides for timely UI transitions without waiting for backend refresh
  const [socketStatus, setSocketStatus] = useState<"LIVE" | "ENDED" | "PAUSED" | null>(
    null
  );
  // Grace period countdown for PAUSED state
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState<number>(90);
  const [graceCountdown, setGraceCountdown] = useState<number>(0);
  const graceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isPausedEffective = socketStatus === "PAUSED" || (statusEnum === StreamStatus.PAUSED && socketStatus !== "LIVE" && socketStatus !== "ENDED");

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

  // Treat PAUSED as "still live" — keep player mounted, chat open, tips/likes allowed
  const isLiveEffective =
    !isEndedStatus && (socketStatus === "LIVE" || isPausedEffective || (isLiveStatus && socketStatus !== "ENDED"));
  const isEndedEffective = socketStatus === "ENDED" || isEndedStatus;
  useEffect(() => {
    if (!isLiveEffective) clearReactions();
  }, [isLiveEffective, clearReactions]);
  // Effective playback URL, only when playable.
  //
  // The HLS ladder is dead the moment ingest stops, so an ended stream played
  // nothing at all here. Once its capture reports ready the broadcast exists
  // as a plain mp4 on the CDN, and that is what a viewer arriving late should
  // get — a recording, with a scrubber, rather than a black screen.
  const playbackId = streamEntity?.playbackId || playbackIdProp;
  const replayUrl = useMemo(
    () => extractReplayUrl(streamEntity) || null,
    [streamEntity],
  );
  const isPlayingReplay = !isLiveEffective && !!replayUrl;
  const effectiveVideoUrl = useMemo(() => {
    if (!isPlayable) return null;
    if (isPlayingReplay) return replayUrl;
    const liveUrl = buildHlsFromPlayback(playbackId, streamEntity?.provider);
    return liveUrl || null;
  }, [isPlayable, isPlayingReplay, replayUrl, playbackId, streamEntity?.provider]);

  const isScheduledEffective =
    !isLiveEffective && !isEndedEffective && isScheduledStatus;
  // Offline when not live, not ended, and not scheduled
  const isOfflineEffective =
    !isLiveEffective && !isEndedEffective && !isScheduledEffective;

  const makeKey = useCallback((sid: string | null | undefined) => {
    return sid ? `${sid}:${connectedGenRef.current}` : "";
  }, []);

  const maybeJoinRoom = useCallback(
    (sid?: string | null) => {
      const s = sid || streamId;
      if (!s) return;
      const key = makeKey(s);
      if (joinRoomSentKeyRef.current === key) return;
      try {
        socketEmitAuthed(LivestreamEvents.JoinRoom, { streamId: s });
        joinRoomSentKeyRef.current = key;
      } catch {}
    },
    [streamId, makeKey, socketEmitAuthed]
  );
  useEffect(() => { maybeJoinRoomRef.current = maybeJoinRoom; }, [maybeJoinRoom]);

  const maybeJoinStream = useCallback(
    (sid?: string | null) => {
      const s = sid || streamId;
      if (!s) return;
      if (!(isLiveEffective && isSignedIn && ownerStatus === "viewer")) return;
      const key = makeKey(s);
      if (joinStreamSentKeyRef.current === key) return;
      try {
        socketEmitAuthed(LivestreamEvents.JoinStream, { streamId: s });
        joinStreamSentKeyRef.current = key;
        didJoinRef.current = true;
        didLeaveRef.current = false;
      } catch {}
    },
    [
      streamId,
      isLiveEffective,
      isSignedIn,
      ownerStatus,
      makeKey,
      socketEmitAuthed,
    ]
  );
  useEffect(() => { maybeJoinStreamRef.current = maybeJoinStream; }, [maybeJoinStream]);

  // Join room on connect; only JoinStream when stream is actually LIVE and we're a viewer
  useEffect(() => {
    if (!streamId || !connected) return;
    if (!prevConnectedRef.current) {
      connectedGenRef.current += 1;
      prevConnectedRef.current = true;
    }
    maybeJoinRoom(streamId);
    // Only join as active viewer when stream is confirmed LIVE and user is signed in viewer
    if (isSignedIn && ownerStatus === "viewer" && isLiveEffective) {
      maybeJoinStream(streamId);
    }
  }, [streamId, connected, maybeJoinRoom, maybeJoinStream, isSignedIn, ownerStatus, isLiveEffective]);

  // Rejoin on reconnect is defined later after effective status is computed

  // console.log({activities})
  // Seed initial activities from stream entity (render first)
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
    const mapStatus = (s: any): StreamActivityType | "SYSTEM" => {
      const u = String(s || "").toUpperCase();
      switch (u) {
        case "MESSAGE":
          return StreamActivityType.MESSAGE;
        case "JOINED":
        case "JOIN":
          return StreamActivityType.JOINED;
        case "LEFT":
        case "LEAVE":
          return StreamActivityType.LEFT;
        case "TIP":
        case "TIPPED":
          return StreamActivityType.TIP;
        case "START":
          return StreamActivityType.START;
        case "END":
          return StreamActivityType.END;
        default:
          return "SYSTEM";
      }
    };
    const initial: Activity[] = (rawAct as any[])
      .map((it: any) => ({
        status: mapStatus(it?.status),
        address: it?.address as string | undefined,
        createdAt: it?.createdAt
          ? new Date(it.createdAt).getTime()
          : Date.now(),
        // REST activities carry `account` as the userReferenceProjection
        user: it?.account || it?.user || undefined,
        meta: it?.meta || {},
      }))
      .sort(
        (a: Activity, b: Activity) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    // Prepend initial activities so they render first
    setActivities((prev: Activity[]) =>
      ([...initial, ...prev] as Activity[]).slice(-400)
    );
    seededInitialActivitiesRef.current = sid;
  }, [streamEntity, streamId]);

  // On reconnect rising edge, bump epoch and re-emit joins exactly once per stream
  useEffect(() => {
    if (!connected) prevConnectedRef.current = false;
  }, [connected, streamId, maybeJoinRoom, maybeJoinStream]);

  // Always listen for Start/End to update local effective status
  useEffect(() => {
    if (!streamId) return;
    const subs: Array<() => void> = [];
    const bind = (evt: LivestreamEvents, handler: (d: any) => void) => {
      const off = socketOn(evt, handler) || (() => {});
      subs.push(off);
    };
    bind(LivestreamEvents.StartStream, (data: any) => {
      console.log(
        "[viewer] frontend received",
        LivestreamEvents.StartStream,
        data
      );
      setSocketStatus("LIVE");
      // Clear any paused state on stream start/resume
      setStreamPaused(false);
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    });
    bind(LivestreamEvents.EndStream, (data: any) => {
      console.log(
        "[viewer] frontend received",
        LivestreamEvents.EndStream,
        data
      );
      setSocketStatus("ENDED");
      refetchStream();
      // Clear paused state on end
      setStreamPaused(false);
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    });
    return () => {
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [streamId, socketOn]);

  // Join stream when we become effectively live (deduped per epoch)
  useEffect(() => {
    if (!streamId || !isLiveEffective || !isSignedIn || ownerStatus !== "viewer") return;
    maybeJoinStream(streamId);
  }, [streamId, isLiveEffective, maybeJoinStream, isSignedIn, ownerStatus]);

  // Keep a ref of liveLikes for debounced updates (value mirrored later)
  const liveLikesRef = useRef<number>(0);

  // Bind chat and meta events independent of current status
  useEffect(() => {
    if (!streamId) return;
    const subs: Array<() => void> = [];
    const bind = (evt: LivestreamEvents, handler: (d: any) => void) => {
      const off = socketOn(evt, handler) || (() => {});
      subs.push(off);
    };
    bind(LivestreamEvents.SendMessage, (payload: any) => {
      const m = payload?.message || payload;
      const meta = m?.meta || payload?.meta || {};
      const content = meta?.content || m?.content || m?.meta?.content;
      const username = m?.user?.username || meta?.username;
      const addr = m?.user?.address || meta?.address;
      // Prefer nested user object (userReferenceProjection), fallback to account
      const userRef = m?.user || m?.account || payload?.user || payload?.account || undefined;
      if (!content) return;
      const key = `${(addr || username || "").toLowerCase()}::${(
        content || ""
      ).trim()}`;
      // If recent optimistic exists, mark it confirmed and skip adding a duplicate
      const found = popRecentOptimistic(key);
      if (found) {
        setActivities((prev) => {
          const copy = prev.slice();
          // find last optimistic matching this key
          const idx =
            typeof found.idx === "number"
              ? found.idx
              : copy
                  .map((a, i) => ({ a, i }))
                  .reverse()
                  .find(
                    (x) =>
                      x.a.optimistic &&
                      x.a.status === StreamActivityType.MESSAGE &&
                      ((x.a.address || "").toLowerCase() ===
                        (addr || "").toLowerCase() ||
                        (x.a.meta?.username || "").toLowerCase() ===
                          (username || "").toLowerCase()) &&
                      String(x.a.meta?.content || "").trim() ===
                        String(content).trim()
                  )?.i ?? -1;
          if (idx >= 0) {
            const existing = copy[idx];
            copy[idx] = { ...existing, optimistic: false, user: userRef || existing.user } as Activity;
            return copy;
          }
          return prev;
        });
        return;
      }
      addActivity({
        status: StreamActivityType.MESSAGE,
        address: addr,
        user: userRef,
        meta: {
          username,
          content,
          avatarImageUrl: m?.user?.avatarImageUrl || meta?.avatarImageUrl,
        },
      });
    });
    bind(LivestreamEvents.JoinStream, (data: any) => {
      if (data?.streamId && data.streamId !== streamId) return;
      const userRef = data?.user || data?.account || undefined;
      const joinName = userRef?.displayName || userRef?.username || data?.username || '';
      const joinAvatar = userRef?.avatarImageUrl;
      setJoinEvent({ id: `${Date.now()}-${joinName}`, displayName: joinName, avatarUrl: joinAvatar });
      addActivity({
        status: StreamActivityType.JOINED,
        address: userRef?.address || data?.address,
        user: userRef,
        meta: {
          username: userRef?.username || data?.username,
          avatarImageUrl: userRef?.avatarImageUrl,
        },
      });
    });
    bind(LivestreamEvents.AnonJoinStream, (data: any) => {
      if (data?.streamId && data.streamId !== streamId) return;
      addActivity({
        status: StreamActivityType.JOINED,
        meta: { username: "Visitor" },
      });
    });
    bind(LivestreamEvents.LeaveStream, (data: any) => {
      const userRef = data?.user || data?.account || undefined;
      addActivity({
        status: StreamActivityType.LEFT,
        address: userRef?.address || data?.address,
        user: userRef,
        meta: {
          username: userRef?.username || data?.username,
          avatarImageUrl: userRef?.avatarImageUrl,
        },
      });
    });
    // Debounce LikeStream updates to reduce UI churn (~2Hz)
    let likesTimer: any = null;
    let likesLast = 0;
    let likesLatest = liveLikesRef.current || 0;
    const pushLikes = () => {
      setLiveLikes(likesLatest);
      likesLast = Date.now();
    };
    bind(LivestreamEvents.LikeStream as any, (payload: any) => {
      if (typeof payload?.likes === "number") {
        likesLatest = payload.likes;
      } else {
        likesLatest = (likesLatest || liveLikesRef.current || 0) + 1;
      }
      const now = Date.now();
      const delta = now - likesLast;
      if (delta >= 500) {
        pushLikes();
      } else if (!likesTimer) {
        likesTimer = setTimeout(() => {
          try {
            clearTimeout(likesTimer);
          } catch {}
          likesTimer = null;
          pushLikes();
        }, 500 - delta);
      }
    });
    // Dedupe optimistic gifts with server TipStreamer confirmation
    bind(LivestreamEvents.TipStreamer, (payload: any) => {
      // Read the sender line out over the stream. Spoken off the BROADCAST
      // rather than the optimistic send, so it is said exactly once and every
      // viewer hears the same words at the same moment.
      speakTipMessage(payload?.gift?.meta?.message);
      const amt = Number(payload?.gift?.meta?.amount || 0);
      const username = payload?.gift?.meta?.username || payload?.gift?.meta?.displayName;
      // Prefer nested user/account ref for rich profile data
      const tipUserRef = payload?.gift?.user || payload?.gift?.account || payload?.user || undefined;
      const senderRaw =
        tipUserRef?.address ||
        payload?.gift?.meta?.address ||
        payload?.gift?.address ||
        "";
      const sender = String(senderRaw || "").toLowerCase();
      const me = String((user?.walletAddress || user?.address || "")).toLowerCase();
      const now = Date.now();
      // If it's our own confirmed gift, try to confirm an optimistic one instead of adding a duplicate
      if (me && sender && sender === me) {
        // Enqueue tip visual effect for own gifts too
        enqueueFromGift({
          amount: amt,
          message: payload?.gift?.meta?.message,
          username,
          selectedTier: payload?.gift?.meta?.selectedTier,
        } as any);
        setActivities((prev) => {
          const copy = prev.slice();
          // find most recent optimistic TIP from me with same amount in the last 15s
          const idx = copy
            .map((a, i) => ({ a, i }))
            .reverse()
            .find(
              (x) =>
                x.a.optimistic &&
                x.a.status === StreamActivityType.TIP &&
                String(x.a.address || "").toLowerCase() === me &&
                Number(x.a?.meta?.amount) === amt &&
                now - (x.a.createdAt || now) < 15000
            )?.i ?? -1;
          if (idx >= 0) {
            const existing = copy[idx];
            copy[idx] = {
              ...existing,
              optimistic: false,
              createdAt: now,
              user: tipUserRef || existing.user,
              meta: { ...(existing.meta || {}), username, amount: amt },
            } as Activity;
            return copy;
          }
          // No optimistic found (edge case: optimistic was pruned) — add a single confirmed entry
          return copy
            .concat({
              status: StreamActivityType.TIP,
              address: sender,
              createdAt: now,
              user: tipUserRef,
              meta: { username, amount: amt },
            } as Activity)
            .slice(-400);
        });
        return;
      }
      // Gifts from other users: add once
      addActivity({
        status: StreamActivityType.TIP,
        address: sender,
        user: tipUserRef,
        meta: { username, amount: amt },
      });
      // Update gift banner
      setGiftEvent({ id: `${Date.now()}-${sender}`, displayName: username || sender, avatarUrl: tipUserRef?.avatarImageUrl, amount: amt, message: payload?.gift?.meta?.message });
      // Enqueue tip visual effect for other users' gifts
      enqueueFromGift({
        amount: amt,
        message: payload?.gift?.meta?.message,
        username,
        selectedTier: payload?.gift?.meta?.selectedTier,
      } as any);
    });
    // Reaction events from other viewers or self-echo
    bind(LivestreamEvents.StreamReaction as any, (data: any) => {
      if (data?.streamId && data.streamId !== streamId) return;
      // Backend sends { reactionType, user: <userRef> }
      const type = data?.reactionType as ReactionType;
      const rUsername = data?.user?.displayName || data?.user?.username;
      if (type) addReaction(type, rUsername, data?.weight);
    });
    // Settings updates from streamer (e.g. chat toggled)
    bind(LivestreamEvents.SettingsUpdate as any, (data: any) => {
      const settings = data?.settings;
      if (settings) {
        const chatEnabled = settings?.chat?.enabled ?? settings?.enableChat;
        if (typeof chatEnabled === 'boolean') setLiveChatEnabled(chatEnabled);
      }
    });
    // Stream paused/resumed with grace period countdown
    bind(LivestreamEvents.StreamPaused as any, (data: any) => {
      setStreamPaused(true);
      setSocketStatus("PAUSED");
      const grace = typeof data?.gracePeriodSeconds === 'number' ? data.gracePeriodSeconds : 90;
      setGracePeriodSeconds(grace);
      setGraceCountdown(grace);
    });
    bind(LivestreamEvents.StreamResumed as any, () => {
      setStreamPaused(false);
      setSocketStatus("LIVE");
      setGraceCountdown(0);
      if (graceTimerRef.current) {
        clearInterval(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    });
    // Debounced viewer count updates using shared util
    const updater = createViewCountUpdater({
      setLive: setLiveViewers,
      setPeak: setPeakViewers,
      getPeak: () => peakViewersRef.current,
      debounceMs: 500,
    });
    bind(LivestreamEvents.ViewCountUpdate as any, ({ streamId: updatedStreamId, viewerCount }: any) => {
      if (updatedStreamId !== streamId) return;
      updater.onViewCount(typeof viewerCount === "number" ? viewerCount : 0);
    });
    return () => {
      try {
        /* likesTimer may be pending */ if (likesTimer)
          clearTimeout(likesTimer);
      } catch {}
      try { updater.dispose(); } catch {}
      try { clearTipEffects(); } catch {}
      try { clearReactions(); } catch {}
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [streamId, socketOn, addActivity, user?.walletAddress, user?.address]);

  // Emit LeaveStream on unmount — guarded by didLeaveRef so it only fires once.
  useEffect(() => {
    return () => {
      const sid = streamIdRef.current;
      if (!sid || didLeaveRef.current) return;
      didLeaveRef.current = true;
      console.log('[LiveStreamPlayer] unmount cleanup: emitting LeaveStream', { streamId: sid });
      try {
        socketEmitRef.current(LivestreamEvents.LeaveStream, { streamId: sid });
      } catch (e) {
        console.warn('[LiveStreamPlayer] unmount LeaveStream emit failed', e);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emit LeaveStream on navigation blur and re-Join on focus.
  // Uses [] deps + refs so React never tears down / re-creates this effect
  // when maybeJoinRoom/Stream identity changes (which caused spurious blur→focus).
  useFocusEffect(
    useCallback(() => {
      // On focus: re-join if we previously left
      const sid = streamIdRef.current;
      if (sid) {
        try {
          maybeJoinRoomRef.current(sid);
          maybeJoinStreamRef.current(sid);
        } catch {}
      }
      // On blur: emit LeaveStream (once)
      return () => {
        const sid = streamIdRef.current;
        if (!sid || didLeaveRef.current) return;
        didLeaveRef.current = true;
        // Reset join keys so next focus can re-join
        joinRoomSentKeyRef.current = null;
        joinStreamSentKeyRef.current = null;
        console.log('[LiveStreamPlayer] blur cleanup: emitting LeaveStream', { streamId: sid });
        try {
          socketEmitRef.current(LivestreamEvents.LeaveStream, { streamId: sid });
        } catch (e) {
          console.warn('[LiveStreamPlayer] blur LeaveStream emit failed', e);
        }
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // Emit LeaveStream when app goes background/inactive, re-Join on active
  useEffect(() => {
    const onAppStateChange = (state: string) => {
      const sid = streamIdRef.current;
      if (!sid) return;
      if (state === "active") {
        try {
          maybeJoinRoomRef.current(sid);
          maybeJoinStreamRef.current(sid);
        } catch {}
      } else if (state === "background" || state === "inactive") {
        if (didLeaveRef.current) return;
        didLeaveRef.current = true;
        joinRoomSentKeyRef.current = null;
        joinStreamSentKeyRef.current = null;
        console.log('[LiveStreamPlayer] app background: emitting LeaveStream', { streamId: sid });
        try {
          socketEmitRef.current(LivestreamEvents.LeaveStream, { streamId: sid });
        } catch (e) {
          console.warn('[LiveStreamPlayer] background LeaveStream emit failed', e);
        }
      }
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => {
      try {
        sub.remove();
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web: emit leave on page hide/unload; re-join on visibility return
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      const sid = streamIdRef.current;
      if (!sid) return;
      const hidden = (document as any).hidden === true;
      if (hidden) {
        if (didLeaveRef.current) return;
        didLeaveRef.current = true;
        joinRoomSentKeyRef.current = null;
        joinStreamSentKeyRef.current = null;
        try {
          socketEmitRef.current(LivestreamEvents.LeaveStream, { streamId: sid });
        } catch {}
      } else {
        try {
          maybeJoinRoomRef.current(sid);
          maybeJoinStreamRef.current(sid);
        } catch {}
      }
    };
    const onBeforeUnload = () => {
      const sid = streamIdRef.current;
      if (!sid || didLeaveRef.current) return;
      didLeaveRef.current = true;
      try {
        socketEmitRef.current(LivestreamEvents.LeaveStream, { streamId: sid });
      } catch {}
    };
    try {
      document.addEventListener("visibilitychange", onVisibility);
    } catch {}
    try {
      window.addEventListener("beforeunload", onBeforeUnload);
    } catch {}
    return () => {
      try {
        document.removeEventListener("visibilitychange", onVisibility);
      } catch {}
      try {
        window.removeEventListener("beforeunload", onBeforeUnload);
      } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chat availability: allowed to send if content is playable (free or unlocked)
  const canChat = isPlayable && isSignedIn;
  const seeded = seedViewerStats(streamEntity);
  const [liveViewers, setLiveViewers] = useState<number>(seeded.liveViewers);
  const [peakViewers, setPeakViewers] = useState<number>(seeded.peakViewers);
  const peakViewersRef = useRef<number>(seeded.peakViewers);
  useEffect(() => {
    peakViewersRef.current = peakViewers;
  }, [peakViewers]);
  // Live likes state (synced from details and socket)
  const [liveLikes, setLiveLikes] = useState<number>(
    typeof streamEntity?.likes === "number"
      ? (streamEntity?.likes as number)
      : typeof (streamEntity as any)?.likesCount === "number"
      ? ((streamEntity as any)?.likesCount as number)
      : 0
  );
  // Mirror into ref for debounced like updates
  useEffect(() => {
    liveLikesRef.current = liveLikes;
  }, [liveLikes]);
  useEffect(() => {
    const nextLikes =
      (typeof streamEntity?.likes === "number"
        ? streamEntity?.likes
        : undefined) ??
      (typeof (streamEntity as any)?.likesCount === "number"
        ? (streamEntity as any)?.likesCount
        : undefined);
    if (typeof nextLikes === "number") setLiveLikes(nextLikes);
  }, [streamEntity?.likes, (streamEntity as any)?.likesCount]);
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
    peakViewersRef.current = init.peakViewers;
    seededViewersRef.current = sid;
  }, [streamEntity, streamId]);

  // Optimistic gift echo: called on on-chain gift success
  const onGiftOptimistic = useCallback(
    ({ amount, message }: { amount: number; message?: string }) => {
      const username = (user as any)?.username || undefined;
      const address = ((user?.walletAddress || user?.address) as
        | string
        | undefined)?.toLowerCase();
      const id = `opt-tip-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      addActivity({
        id,
        status: StreamActivityType.TIP,
        address,
        meta: { username, amount, message },
        optimistic: true,
      });
    },
    [user, addActivity]
  );

  // Send a reaction via socket
  const handleSendReaction = useCallback((type: ReactionType) => {
    if (!streamId || !isLiveEffective || !isSignedIn || !connected) return;
    // Render the room echo once, with the sender's server-resolved badge weight.
    socketEmitAuthed(LivestreamEvents.StreamReaction as any, { streamId, reactionType: type });
  }, [streamId, isLiveEffective, isSignedIn, connected, socketEmitAuthed]);

  // First-load redirect: if not ended and current user is owner, go to LiveProducer
  // Uses isOwner from streamEntity (set by backend) — no extra checkIfBroadcastOwner call needed
  const redirectCheckedRef = useRef(false);
  useEffect(() => {
    if (redirectCheckedRef.current) return;
    if (streamLoading) return;
    if (!streamEntity) return;
    redirectCheckedRef.current = true;
    const status = String(streamEntity.status || "").toUpperCase();
    if (status === "ENDED") {
      setOwnerStatus("viewer");
      return;
    }
    const isOwner = (streamEntity as any)?.isOwner === true;
    if (isOwner) {
      setOwnerStatus("owner");
      navigation.replace(ScreenNames.LiveProducer as any, {
        streamId: streamEntity._id || streamId,
        tokenId: streamEntity.tokenId,
      });
    } else {
      setOwnerStatus("viewer");
    }
  }, [streamLoading, streamEntity, navigation, streamId]);

  // Reactions are the POST's, exactly as on the feed card and on web: the
  // same nine, the same counts, the same shared overlay. The heart used to
  // post to /api/live/:id/like — a counter on the stream document nothing
  // else reads — so a like here never showed anywhere else, and never showed
  // as pressed after a reload.
  const postTokenId = streamEntity?.tokenId ?? tokenId ?? null;
  const postReactions = useLivePostReactions({
    tokenId: postTokenId,
    userAddress: (user?.walletAddress || user?.address || "").toLowerCase() || undefined,
    requireAuth,
    onError: () => toastError(t("feedCard.reactionFailed")),
  });
  // A reaction on a live post is a post reaction, allowed whenever the post
  // exists — an ended stream is still a post, exactly as on web.
  const handleLiveLike = useCallback(() => {
    requireAuth(() => handleSendReaction('LIKE'));
    postReactions.toggle(true);
  }, [postReactions, requireAuth, handleSendReaction]);

  // Share handler
  const handleShare = useCallback(async () => {
    const postId = streamEntity?.tokenId ?? tokenId ?? streamId;
    const url = postId != null ? `${WEBSITE_LINK}/app/post/${postId}` : null;
    if (!url) return;
    await shareProfile(url, `Check out this stream ${url}`);
  }, [streamEntity?.tokenId, streamId, tokenId]);

  // Sound. A stream is opened on purpose, so it starts audible whether or not
  // the user has silenced the feed. The player used to seed itself from the
  // feed's shared mute cache, and with its own top row hidden behind
  // `hideTopControls` and no mute button in the header, a viewer who had
  // ever muted a feed card got a silent stream and nothing to press.
  const [isMuted, setIsMuted] = useState(false);

  // Muting the stream mutes the tip readings with it. They are synthesised in
  // a WebView, so the player own volume does not reach them — a viewer who
  // muted a stream in a quiet room would otherwise have had an old man start
  // shouting tip messages at them.
  useEffect(() => {
    setTipTtsEnabled(!isMuted);
  }, [isMuted]);
  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  /*
   * The live picture, over WebRTC where that is possible.
   *
   * The self-hosted ingest remuxes rather than transcodes, so its HLS ladder
   * carries the Opus audio the broadcaster published — which Android decodes
   * and Apple does not, at any layer. On an iPhone that makes a self-hosted
   * stream unplayable over HLS no matter which surface asks for it, so WebRTC
   * is not a latency nicety there, it is the only route in. It is also the one
   * the web app has always preferred on this screen.
   *
   * Gated exactly like the URL above: a stream this viewer has not unlocked
   * never opens a session, so the paywall cannot be stepped around by changing
   * transport. Any failure — no route, a hostile network, a stream that is not
   * really on air — falls straight back to the HLS ladder.
   */
  const whepLive = useWhepStream({
    // Android plays this same HLS ladder in the home card. Prefer that proven
    // path here too: an attached WHEP track can negotiate without rendering a
    // frame, leaving the viewer black while the feed keeps playing.
    enabled: Platform.OS !== "android" && isPlayable && isLiveEffective && !isPlayingReplay,
    stream: { playbackId, provider: streamEntity?.provider },
    muted: isMuted,
  });

  // Immersive: chrome off, status bar off, and the phone turned sideways
  // when the picture is wider than it is tall. The player draws the stream
  // `contain`, so a landscape broadcast on a portrait screen is a band across
  // the middle with the chat over it — which is what "it isn't fullscreen"
  // reports were describing. Portrait streams already fill the screen and
  // only lose the chrome.
  /**
   * The timeline the scrub line draws, in 0..1 of the source.
   *
   * A stream that is actually on air has no duration to scrub through, so
   * `seekRef` comes back null and the bar sits at zero and refuses the
   * drag. A replay — an ended stream with a recording, which is most of
   * what anyone opens after the fact — is an ordinary file, and gets the
   * same bar the shorts viewer has.
   */
  const progress = useSharedValue(0);
  const durationRef = useRef(0);
  const scrubbingRef = useRef(false);
  const seekRef = useRef<((ratio: number) => void) | null>(null);
  const [seekable, setSeekable] = useState(false);
  const handleProgress = useCallback((positionMs: number, durationMs: number) => {
    durationRef.current = durationMs;
    setSeekable(durationMs > 0);
    // A drag owns the bar until the finger lifts; the clock would otherwise
    // yank it back to wherever playback still is.
    if (scrubbingRef.current || !(durationMs > 0)) return;
    progress.value = Math.max(0, Math.min(1, positionMs / durationMs));
  }, [progress]);
  const handleScrubbingChange = useCallback((scrubbing: boolean) => {
    scrubbingRef.current = scrubbing;
  }, []);
  const handleSeek = useCallback((ratio: number) => {
    seekRef.current?.(ratio);
  }, []);

  const [immersive, setImmersive] = useState(false);
  const immersiveRef = useRef(false);
  const videoSizeRef = useRef<{ width: number; height: number } | null>(null);
  const updateOrientation = useMemo(() => createLiveViewerOrientation({
    portrait: () => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP),
    landscape: () => ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
      .catch(() => ScreenOrientation.unlockAsync()),
    unlocked: () => ScreenOrientation.unlockAsync(),
  }), []);
  const handleVideoSize = useCallback((size: { width: number; height: number }) => {
    videoSizeRef.current = size;
    // Went immersive before the size was known: turn now.
    if (immersiveRef.current) updateOrientation(true, size);
  }, [updateOrientation]);
  const enterImmersive = useCallback(() => {
    immersiveRef.current = true;
    setImmersive(true);
    StatusBar.setHidden(true);
    updateOrientation(true, videoSizeRef.current);
  }, [updateOrientation]);
  const exitImmersive = useCallback(() => {
    immersiveRef.current = false;
    setImmersive(false);
    StatusBar.setHidden(false);
    updateOrientation(false);
  }, [updateOrientation]);
  useFocusEffect(useCallback(() => () => exitImmersive(), [exitImmersive]));
  // Hardware back steps out of immersive before it leaves the stream. Handled
  // here rather than via `beforeRemove` because the player pauses and mutes
  // itself on that event whether or not the removal is then prevented.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!immersiveRef.current) return false;
      exitImmersive();
      return true;
    });
    return () => sub.remove();
  }, [exitImmersive]);
  // Leaving the screen while immersive hands the status bar back; the player
  // already restores portrait on unmount.
  useEffect(
    () => () => {
      if (immersiveRef.current) StatusBar.setHidden(false);
    },
    []
  );

  // Gift modal state
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const handleGiftPress = useCallback(() => {
    if (!isLiveEffective) return;
    requireAuth?.(() => setGiftOpen(true));
  }, [isLiveEffective, requireAuth]);

  // Chat send handler
  // The stream's chat room, keyed by the post's tokenId — the room the web
  // app joins for the same post. Messages used to ride the livestream
  // gateway's own room and store, which no web client ever read: a phone
  // and a browser watching the same stream were in two different chats,
  // and the phone's had no avatars because that gateway sends none.
  const chatRoomId = postTokenId != null ? `stream:${postTokenId}` : undefined;
  const liveChat = useLiveChat(chatRoomId);

  // One list for the chat overlay: the room's messages, plus the join/gift/
  // system moments the livestream socket still carries.
  const chatActivities = useMemo<Activity[]>(() => {
    const arrivals = new Set<string>();
    const moments = [...activities].reverse().filter((a) => {
      if (a.status === StreamActivityType.MESSAGE) return false;
      const address = (a.address || a.user?.address || "").toLowerCase();
      if (a.status !== StreamActivityType.JOINED || !address) return true;
      if (arrivals.has(address)) return false;
      arrivals.add(address);
      return true;
    }).reverse();
    if ((isLiveEffective || isEndedEffective) && !moments.some((a) => a.status === StreamActivityType.START)) {
      moments.unshift({ status: StreamActivityType.START, createdAt: 0 });
    }
    const messages: Activity[] = liveChat.messages.map((m) => ({
      id: m._id,
      status: StreamActivityType.MESSAGE,
      address: (m.senderAddress || m.sender?.address || "").toLowerCase(),
      createdAt: m.createdAt ? Date.parse(m.createdAt) : Date.now(),
      user: m.sender
        ? {
            address: m.sender.address,
            username: m.sender.username,
            displayName: m.sender.displayName,
            avatarImageUrl: m.sender.avatarUrl,
            badgeBalance: m.sender.badgeBalance,
            followers: m.sender.followers,
            followings: m.sender.followings,
          }
        : undefined,
      meta: {
        username: m.sender?.displayName || m.sender?.username,
        content: m.content,
        gifUrl: m.messageType === "gif" ? (m.media?.[0]?.url || m.gif?.url || m.content) : undefined,
        avatarImageUrl: m.sender?.avatarUrl,
      },
    }));
    return [...moments, ...messages].sort((a, b) => {
      if (a.status === StreamActivityType.START) return b.status === StreamActivityType.START ? 0 : -1;
      if (b.status === StreamActivityType.START) return 1;
      return a.createdAt - b.createdAt;
    });
  }, [activities, liveChat.messages, isLiveEffective, isEndedEffective]);

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || !chatRoomId || !isSignedIn) return;
      // No optimistic row: the gateway re-broadcasts the message to the room,
      // sender included, within the round trip, and a refused send comes back
      // on its error channel instead of vanishing.
      liveChat.sendMessage({ content: content.trim(), messageType: "text" });
    },
    [chatRoomId, isSignedIn, liveChat]
  );
  const handleSendGif = useCallback((url: string) => {
    if (!chatRoomId || !isSignedIn || !url) return;
    liveChat.sendMessage({ content: url, messageType: "gif", media: [{ url, type: "gif" }] });
  }, [chatRoomId, isSignedIn, liveChat]);


  // Determine status overlay type
  const overlayStatus = useMemo(() => {
    if (streamLoading && !streamEntity) return "loading" as const;
    if (isPausedEffective && isLiveEffective) return "paused" as const;
    // A replay covers the ended card: the stream is over, but there is a
    // recording playing underneath and an overlay would sit on top of it.
    if (isEndedEffective) return isPlayingReplay ? null : ("ended" as const);
    if (isScheduledEffective) return "scheduled" as const;
    if (isOfflineEffective) return "offline" as const;
    return null;
  }, [streamLoading, streamEntity, isPausedEffective, isLiveEffective, isEndedEffective, isPlayingReplay, isScheduledEffective, isOfflineEffective]);

  return (
    <View className="flex-1 dark-surface bg-black"
      onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}>
      {/* Reads tip messages out loud. Zero-size, no chrome, no layout. */}
      <TipSpeaker />
      {/* Full-screen video player as background */}
      <View className="absolute inset-0">
        {whepLive.stream ? (
          /* WebRTC is carrying the picture. The chrome below is drawn over
             whatever renders it, so this swaps in without touching any of it. */
          <LiveWebRtcView stream={whepLive.stream} />
        ) : whepLive.pending ? (
          /* An attempt is in flight. The ladder waits rather than starting
             underneath it: on a working network WebRTC arrives before HLS has
             buffered its first segments, and starting both means the viewer
             watches the stream begin and then restart. Bounded by the hook's
             own start timeout, after which this is false and HLS takes over. */
          <View className="flex-1 dark-surface bg-black items-center justify-center" pointerEvents="none">
            <DeHubLoader size={40} />
          </View>
        ) : (isLiveEffective || isEndedEffective) && effectiveVideoUrl ? (
          <VideoArea
            isTranscoding={false}
            isLockedOrPPV={!!isLockedOrPPV}
            lockedFetchLoading={streamLoading && isLockedOrPPV}
            /*
             * A gated stream is handed no URL at all, which is what makes
             * VideoArea render its unlock panel instead of the player.
             *
             * An uploaded video is gated by the backend withholding its URL;
             * a live stream is served from a public playbackId, so the URL is
             * always there and the gate has to be applied here. Without this a
             * PPV stream played for everyone.
             */
            effectiveVideoUrl={isPlayable ? effectiveVideoUrl : undefined}
            accessInfo={resolvedAccessInfo}
            streamInfo={streamEntity?.streamInfo as any}
            minter={(streamEntity?.address as any) || (minterProp as any)}
            tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
            onProgress={handleProgress}
            seekRef={seekRef}
            /* A replay is a finished file: it gets a scrubber, a live stream does not. */
            isLive={!isPlayingReplay}
            fullscreen
            hideTopControls
            muted={isMuted}
            onVideoSize={handleVideoSize}
          />
        ) : (
          <View className="flex-1 dark-surface bg-black" />
        )}
      </View>

      {/* Overlay container on top of video */}
      <View className="absolute inset-0" pointerEvents="box-none">
        {/* The timeline, on the floor of the screen — the same bar the
            shorts viewer draws, from the same component. It stays through
            immersive: a viewer who has just cleared the chrome to watch is
            exactly the one who wants to move about in a replay. */}
        {isPlayingReplay && (
          <ViewerScrubBar
            progress={progress}
            onSeek={handleSeek}
            enabled={seekable}
            onScrubbingChange={handleScrubbingChange}
          />
        )}

        {/* Immersive: just the picture, with sound and a way back in the corner. */}
        {immersive && (
          <View
            pointerEvents="box-none"
            style={{ position: "absolute", top: EDGE, right: EDGE }}
          >
            <LiveViewerPlayerControls
              isMuted={isMuted}
              immersive
              onToggleMute={toggleMute}
              onToggleImmersive={exitImmersive}
            />
          </View>
        )}

        {!immersive && (
        <>
          {/* Top gradient for readability */}
          <LinearGradient
            colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0)"]}
            style={{ height: 120, position: "absolute", top: 0, left: 0, right: 0 }}
            pointerEvents="none"
          />
  
          {/* Bottom gradient for readability */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
            style={{ height: 320, position: "absolute", bottom: 0, left: 0, right: 0 }}
            pointerEvents="none"
          />
  
          {/* Main content layout */}
          <View className="flex-1" pointerEvents="box-none">
            {/* Flat EDGE, no inset: the root SafeAreaView already pays the status bar
                and gesture bar, and useSafeAreaInsets reports them again. */}
            <View className="flex-1" pointerEvents="box-none" style={{ paddingTop: EDGE }}>
              {/* Header: Creator info + LIVE badge + viewers + close */}
              <LiveViewerHeader
                creator={creator}
                creatorLoading={creatorLoading}
                isFollowing={isFollowing}
                followLoading={followLoading}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                viewerAddress={(user?.walletAddress || user?.address) as string}
                viewerCount={liveViewers}
                likeCount={postReactions.likeCount}
                giftCount={resolvedTotalTips}
                isMuted={isMuted}
                onToggleMute={toggleMute}
                fallbackMinter={minterProp}
                onOptionsPress={() => setShowOptionsMenu(true)}
                onCollapse={enterImmersive}
              />
  
              {/* State, elapsed time and title, on one scrollable line. */}
              <LiveViewerPills
                isLive={isLiveEffective}
                isPaused={isPausedEffective}
                isEnded={isEndedEffective}
                isScheduled={isScheduledEffective}
                startedAt={startedAtDate}
                title={resolvedTitle || undefined}
              />

              {/* Middle area - transparent, shows video */}
              <View className="flex-1" pointerEvents="box-none" />
  
              {/* Bottom section: shop + chat + reactions + input */}
              <View pointerEvents="box-none" style={{ paddingBottom: EDGE + 10 }}>
                {/* Whatever the host has put "on air", above the chat so a busy
                    room cannot scroll it away. Renders nothing when the stream
                    has no products attached. */}
                <StreamShopOverlay
                  tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
                />
  
                {/* The creator's affiliate board. Its own button rather than a
                    row inside the products overlay above: that one is a store
                    checkout and this one leaves the app, and folding them
                    together would put "buy here" and "buy somewhere else" behind
                    one tap. `applyLiveAccess` flattens the token's board onto the
                    stream row, so it arrives with the stream. */}
                <ShopBoard
                  tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
                  links={(streamEntity as any)?.shopLinks}
                  listingCount={(streamEntity as any)?.shopListingCount}
                />
  
                {/* TikTok-style join/gift banners */}
                <LiveEventBanner joinEvent={joinEvent} giftEvent={giftEvent} />
  
                {/* The room. Read-only now — saying something is the bar's job. */}
                <LiveViewerChat activities={chatActivities} />

                {/* Say something, or do something: one row of it. */}
                <LiveViewerActionBar
                  viewportHeight={viewportHeight}
                  canSend={!!canChat && liveChat.connected && !liveChat.isBanned}
                  chatEnabled={liveChatEnabled}
                  isLive={isLiveEffective}
                  isEnded={isEndedEffective}
                  isScheduled={isScheduledEffective}
                  onSendMessage={handleSendMessage}
                  onSendGif={handleSendGif}
                  onReact={handleSendReaction}
                  onLike={handleLiveLike}
                  onShare={handleShare}
                  onGiftPress={handleGiftPress}
                  likeCount={postReactions.likeCount}
                  isLiked={postReactions.isLiked}
                  actionsDisabled={!isSignedIn || !isLiveEffective}
                />
              </View>
            </View>
          </View>
        </>
        )}

        {/* Floating Reaction Bubbles - right side */}
        <ReactionOverlay reactions={reactions} onRemove={removeReaction} />

        {/* Tip Animations Overlay */}
        <TipAnimationsOverlay items={tipEffects} />

        {/* Status overlays: paused/ended/scheduled/offline/loading */}
        <LiveViewerStatusOverlay
          status={overlayStatus}
          graceCountdown={graceCountdown}
          scheduledForDate={scheduledForDate}
          endedAtDate={endedAtDate}
          startedAtDate={startedAtDate}
        />
      </View>

      {/* Options sheet — the same one the feed card and the shorts viewer
          open. A stream is a post, and this was the only post surface in the
          app with no way to save, share, report, block or (for the owner of an
          ended stream) delete it. Mounted here rather than inside the header
          for the usual reason: the header is memoised chrome, and the sheet
          owns modals of its own. */}
      {showOptionsMenu && (
        <PostOptionsMenu
          visible={showOptionsMenu}
          onClose={() => setShowOptionsMenu(false)}
          tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
          isOwner={ownerStatus === "owner" || (streamEntity as any)?.isOwner === true}
          isHidden={!!(streamEntity as any)?.isHidden}
          creatorDisplayName={
            (creator?.displayName || creator?.username || "") as string
          }
          creatorIdentifier={
            (creator?.walletAddress ||
              creator?.address ||
              creator?.username ||
              minterProp ||
              "") as string
          }
          isFollowing={isFollowing}
          currentTitle={resolvedTitle || ""}
          currentDescription={(streamEntity?.description as string) || ""}
          // A stream's title and description are edited from the producer
          // screen, and the report-content flow is for uploaded media — the
          // same two the feed card hides on a live post.
          hideEdit
          hideReportContent={isLiveEffective}
          onFollowChange={(following) => setIsFollowing(following)}
          onDeleteSuccess={() => {
            if (navigation.canGoBack()) navigation.goBack();
          }}
        />
      )}

      {/* Gift Modal */}
      <GiftModal
        open={giftOpen}
        onOpenChange={setGiftOpen}
        tokenId={((streamEntity?.tokenId as number) || (tokenId as number)) || 0}
        toAddress={((streamEntity?.address as string) || (minterProp as string) || "") as string}
        stream={streamEntity || { _id: streamId }}
        onSent={({ amount, message }) => {
          try {
            onGiftOptimistic({ amount, message });
          } catch {}
        }}
      />
    </View>
  );
};

export default LiveStreamPlayer;
