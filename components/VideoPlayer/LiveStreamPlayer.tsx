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
} from "react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import LiveViewerHeader from "../LiveViewer/LiveViewerHeader";
import LiveViewerChat from "../LiveViewer/LiveViewerChat";
import LiveViewerReactionsBar from "../LiveViewer/LiveViewerReactionsBar";
import LiveViewerStatusOverlay from "../LiveViewer/LiveViewerStatusOverlay";
import LiveEventBanner from "../LiveViewer/LiveEventBanner";
import type { EventBannerData } from "../LiveViewer/LiveEventBanner";

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

const buildHlsFromPlayback = (playbackId?: string | null) =>
  playbackId ? `https://livepeercdn.com/hls/${playbackId}/index.m3u8` : null;

const LiveStreamPlayer: React.FC<LiveStreamPlayerProps> = (props) => {
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
  const { streamEntity, streamLoading } = useStreamDetails(
    resolvedStreamId || undefined,
    false
  );

  const accessInput = useMemo(() => {
    if (streamEntity) {
      return {
        tokenId: streamEntity.tokenId,
        minter: streamEntity.address,
        streamInfo: streamEntity.streamInfo,
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
    return !st.isLockedWithLockContent && !st.isLockedWithPPV;
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

  // Effective playback URL (live HLS if playbackId provided), only when playable
  const playbackId = streamEntity?.playbackId || playbackIdProp;
  const effectiveVideoUrl = useMemo(() => {
    if (!isPlayable) return null;
    const liveUrl = buildHlsFromPlayback(playbackId);
    return liveUrl || null;
  }, [isPlayable, playbackId]);

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
  const isEndedStatus = statusEnum === StreamStatus.ENDED;
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
    socketStatus === "LIVE" || isPausedEffective || (isLiveStatus && socketStatus !== "ENDED");
  const isEndedEffective = socketStatus === "ENDED" || isEndedStatus;
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
    const prev = prevConnectedRef.current;
    if (!prev && connected) {
      connectedGenRef.current += 1;
      if (streamId) {
        // Clear per-epoch keys by virtue of new epoch; then emit
        maybeJoinRoom(streamId);
        maybeJoinStream(streamId);
      }
    }
    prevConnectedRef.current = connected;
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
      // Backend sends { reactionType, user: <userRef> }
      const type = data?.reactionType as ReactionType;
      const rUsername = data?.user?.displayName || data?.user?.username;
      if (type) addReaction(type, rUsername);
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
    bind(LivestreamEvents.ViewCountUpdate as any, ({ viewerCount }: any) => {
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

  // Optimistic gift echo: ActionsRow will call this on on-chain success
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
    if (!streamId || !isLiveEffective || !isSignedIn) return;
    addReaction(type, (user as any)?.username);
    socketEmitAuthed(LivestreamEvents.StreamReaction as any, { streamId, reactionType: type });
  }, [streamId, isLiveEffective, isSignedIn, addReaction, socketEmitAuthed, user]);

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

  // Derive user vote for ActionsRow from isLiked field in stream entity
  const actionsUserVote = useMemo(() => {
    if (typeof (streamEntity as any)?.isLiked === 'boolean') {
      return (streamEntity as any).isLiked ? 'like' : null;
    }
    const addr = (user?.walletAddress || user?.address || "").toLowerCase();
    const rec = (streamEntity?.likesRecord || {}) as Record<string, boolean>;
    return addr && rec && !!rec[addr] ? "like" : null;
  }, [user?.walletAddress, user?.address, streamEntity?.likesRecord, (streamEntity as any)?.isLiked]);

  // Like/unlike handler for the reactions bar
  const [likePending, setLikePending] = useState(false);
  const handleLiveLike = useCallback(() => {
    if (!streamId || !isLiveEffective) return;
    if (likePending) return;
    const isUnliking = actionsUserVote === "like";
    requireAuth?.(async () => {
      try {
        setLikePending(true);
        setLiveLikes((c) => (isUnliking ? Math.max(0, c - 1) : c + 1));
        const res: any = await likeLiveStream(streamId, {});
        const serverLikes = res?.likes ?? res?.result?.likes;
        const serverIsLiked = res?.isLiked ?? res?.result?.isLiked;
        if (typeof serverLikes === "number") setLiveLikes(serverLikes);
      } catch {
        setLiveLikes((c) => (isUnliking ? c + 1 : Math.max(0, c - 1)));
      } finally {
        setLikePending(false);
      }
    });
  }, [streamId, isLiveEffective, likePending, actionsUserVote, requireAuth]);

  // Share handler
  const handleShare = useCallback(async () => {
    const url = streamId
      ? `${WEBSITE_LINK}/app/post/${streamId}`
      : tokenId
        ? `${WEBSITE_LINK}/app/post/${tokenId}`
        : null;
    if (!url) return;
    await shareProfile(url, `Check out this stream ${url}`);
  }, [streamId, tokenId]);

  // Gift modal state
  const [giftOpen, setGiftOpen] = useState(false);
  const handleGiftPress = useCallback(() => {
    if (!isLiveEffective || !isSignedIn) return;
    requireAuth?.(() => setGiftOpen(true));
  }, [isLiveEffective, isSignedIn, requireAuth]);

  // Chat send handler
  const handleSendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || !streamId || !isSignedIn) return;
      const addr = (user?.walletAddress || user?.address || "").toLowerCase();
      const username = (user as any)?.username || "You";
      const key = `${(addr || username || "").toLowerCase()}::${content.trim()}`;
      const idx = activities.length;
      try {
        rememberOptimistic(key, idx);
      } catch {}
      addActivity({
        status: StreamActivityType.MESSAGE,
        address: addr,
        meta: { username, content },
        createdAt: Date.now(),
        optimistic: true,
      });
      socketEmitAuthed(LivestreamEvents.SendMessage, { streamId, content });
    },
    [streamId, isSignedIn, user, activities.length, rememberOptimistic, addActivity, socketEmitAuthed]
  );

  // Safe area insets for fullscreen layout
  const insets = useSafeAreaInsets();

  // Determine status overlay type
  const overlayStatus = useMemo(() => {
    if (streamLoading && !streamEntity) return "loading" as const;
    if (isPausedEffective && isLiveEffective) return "paused" as const;
    if (isEndedEffective) return "ended" as const;
    if (isScheduledEffective) return "scheduled" as const;
    if (isOfflineEffective) return "offline" as const;
    return null;
  }, [streamLoading, streamEntity, isPausedEffective, isLiveEffective, isEndedEffective, isScheduledEffective, isOfflineEffective]);

  return (
    <View className="flex-1 bg-black">
      {/* Full-screen video player as background */}
      <View className="absolute inset-0">
        {(isLiveEffective || isEndedEffective) && effectiveVideoUrl ? (
          <VideoArea
            isTranscoding={false}
            isLockedOrPPV={!!isLockedOrPPV}
            lockedFetchLoading={streamLoading && isLockedOrPPV}
            effectiveVideoUrl={effectiveVideoUrl}
            accessInfo={resolvedAccessInfo}
            streamInfo={streamEntity?.streamInfo as any}
            minter={(streamEntity?.address as any) || (minterProp as any)}
            tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
            onProgress={() => {}}
            isLive={true}
            fullscreen
          />
        ) : (
          <View className="flex-1 bg-black" />
        )}
      </View>

      {/* Overlay container on top of video */}
      <View className="absolute inset-0" pointerEvents="box-none">
        {/* Top gradient for readability */}
        <LinearGradient
          colors={["rgba(0,0,0,0.7)", "rgba(0,0,0,0)"]}
          style={{ height: 120 + insets.top, position: "absolute", top: 0, left: 0, right: 0 }}
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
          <View className="flex-1" pointerEvents="box-none" style={{ paddingTop: insets.top }}>
            {/* Header: Creator info + LIVE badge + viewers + close */}
            <LiveViewerHeader
              creator={creator}
              creatorLoading={creatorLoading}
              isFollowing={isFollowing}
              followLoading={followLoading}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              viewerAddress={(user?.walletAddress || user?.address) as string}
              isLive={isLiveEffective && !isPausedEffective}
              isPaused={isPausedEffective}
              isEnded={isEndedEffective}
              viewerCount={liveViewers}
              fallbackMinter={minterProp}
            />

            {/* Stream title - below header */}
            {resolvedTitle ? (
              <View className="px-4 mt-1" pointerEvents="none">
                <Text
                  className="text-white text-sm font-semibold"
                  numberOfLines={1}
                  style={{ textShadowColor: "rgba(0,0,0,0.8)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}
                >
                  {resolvedTitle}
                </Text>
              </View>
            ) : null}

            {/* Middle area - transparent, shows video */}
            <View className="flex-1" pointerEvents="box-none" />

            {/* Bottom section: chat + reactions + input */}
            <View pointerEvents="box-none" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
              {/* TikTok-style join/gift banners */}
              <LiveEventBanner joinEvent={joinEvent} giftEvent={giftEvent} />

              {/* Chat overlay */}
              <LiveViewerChat
                activities={activities}
                canSend={!!canChat}
                isLive={isLiveEffective}
                isEnded={isEndedEffective}
                isScheduled={isScheduledEffective}
                onSendMessage={handleSendMessage}
                onGiftPress={handleGiftPress}
                chatEnabled={liveChatEnabled}
              />

              {/* Reactions bar */}
              <LiveViewerReactionsBar
                onReact={handleSendReaction}
                onLike={handleLiveLike}
                onShare={handleShare}
                disabled={!isSignedIn || !isLiveEffective}
                likeCount={liveLikes}
                isLiked={actionsUserVote === "like"}
                likePending={likePending}
                isLive={isLiveEffective}
              />
            </View>
          </View>
        </View>

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
