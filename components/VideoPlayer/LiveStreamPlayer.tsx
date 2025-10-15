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
  ScrollView,
  Keyboard,
  Platform,
  AppState,
} from "react-native";
import ActionsRow from "./ActionsRow";
import CreatorRow from "./CreatorRow";
import DescriptionBlock from "./DescriptionBlock";
import VideoArea from "./VideoArea";
import { useAuth } from "../../context/AuthContext";
import { useStreamAccessInfo } from "../../libs/validators.util";
import { recordView } from "../../services";
import {
  getAccount,
  followUser,
  unfollowUser,
} from "../../services/user.service";
import { formatDistance } from "date-fns";
import { formatCompactNumber } from "../../libs/numbers.util";
import LiveChatPanel from "../LiveProducer/LiveChatPanel";
import { useWebSocket } from "../../context/WebSocketContext";
import {
  LivestreamEvents,
  StreamActivityType,
  StreamStatus,
} from "../../services/enums/livestream.enum";
import { toastError } from "../../libs";
import { useStreamDetails } from "../../hooks/useStreamDetails";
import { Eye } from "lucide-react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { checkIfBroadcastOwner } from "../../services/live.service";
import { createViewCountUpdater, seedViewerStats } from "../../libs/viewers.util";

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
  const { user, requireAuth, isSignedIn } = useAuth();
  const {
    on: socketOn,
    emitAuthed: socketEmitAuthed,
    connected,
  } = useWebSocket();
  const navigation = useNavigation<any>();

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

  // Creator/channel state (mirrors NormalVideoPlayer)
  const [creatorLoading, setCreatorLoading] = useState<boolean>(true);
  const [creator, setCreator] = useState<any | null>(null);
  const [isFollowing, setIsFollowing] = useState<boolean>(false);
  const [followLoading, setFollowLoading] = useState<boolean>(false);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const minterAddr = (streamEntity?.address || minterProp) as
        | string
        | undefined;
      if (!minterAddr) {
        setCreatorLoading(false);
        return;
      }
      setCreatorLoading(true);
      try {
        const res: any = await getAccount(minterAddr);
        if (cancelled) return;
        const payload = res?.data?.result || res?.result || res || null;
        setCreator(payload);
        const acct = (user?.walletAddress || user?.address || "").toLowerCase();
        if (acct && Array.isArray(payload?.followers)) {
          const isF = payload.followers
            .map((f: string) => (f || "").toLowerCase())
            .includes(acct);
          setIsFollowing(isF);
        } else setIsFollowing(false);
      } catch (e) {
        if (!cancelled) setCreator(null);
        console.warn("[LiveStreamPlayer] getAccount(minter) failed", e);
      } finally {
        if (!cancelled) setCreatorLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [streamEntity?.address, minterProp, user?.walletAddress, user?.address]);

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
      setCreator((prev: any) => {
        if (!prev) return prev;
        const followers = prev.followers || [];
        if (
          followers.map((f: string) => (f || "").toLowerCase()).includes(viewer)
        )
          return prev;
        return { ...prev, followers: [...followers, viewer] };
      });
      try {
        await followUser(viewer, target);
      } catch (e) {
        setIsFollowing(false);
        setCreator((prev: any) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter(
              (f: string) => (f || "").toLowerCase() !== viewer
            ),
          };
        });
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
      try {
        await unfollowUser(viewer, target);
        setIsFollowing(false);
        setCreator((prev: any) => {
          if (!prev) return prev;
          const followers = prev.followers || [];
          return {
            ...prev,
            followers: followers.filter(
              (f: string) => (f || "").toLowerCase() !== viewer
            ),
          };
        });
      } catch (e) {
        toastError("Failed to unfollow user");
      } finally {
        setFollowLoading(false);
      }
    });
  }, [
    creator,
    isFollowing,
    followLoading,
    user?.walletAddress,
    user?.address,
    requireAuth,
  ]);

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
    meta?: any;
    optimistic?: boolean;
  };
  const [activities, setActivities] = useState<Activity[]>([]);
  const addActivity = useCallback(
    (
      a: Partial<Activity> & {
        status: Activity["status"];
        meta?: any;
        address?: string;
      }
    ) => {
      const next: Activity = {
        id: a.id,
        status: a.status,
        address: a.address,
        createdAt: a.createdAt ?? Date.now(),
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

  // Ownership/redirect gating for JoinStream
  const [ownerStatus, setOwnerStatus] = useState<
    "unknown" | "owner" | "viewer"
  >("unknown");
  const didJoinRef = useRef<boolean>(false);

  // Dedupe mechanics across reconnects: track connection epochs and per-epoch sends
  const connectedGenRef = useRef<number>(0);
  const prevConnectedRef = useRef<boolean>(false);
  const joinRoomSentKeyRef = useRef<string | null>(null);
  const joinStreamSentKeyRef = useRef<string | null>(null);

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
  const isLiveStatus = statusEnum === StreamStatus.LIVE;
  const isEndedStatus = statusEnum === StreamStatus.ENDED;
  const scheduledForRaw: any = (streamEntity as any)?.scheduledFor;
  const scheduledForDate = scheduledForRaw ? new Date(scheduledForRaw) : null;
  const isScheduledStatus =
    statusEnum === StreamStatus.SCHEDULED ||
    (!!scheduledForDate && scheduledForDate.getTime() > Date.now());

  // Socket-driven overrides for timely UI transitions without waiting for backend refresh
  const [socketStatus, setSocketStatus] = useState<"LIVE" | "ENDED" | null>(
    null
  );
  const isLiveEffective =
    socketStatus === "LIVE" || (isLiveStatus && socketStatus !== "ENDED");
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

  // Join room on stream change if already connected (once per connection epoch)
  useEffect(() => {
    if (!streamId || !connected) return;
    maybeJoinRoom(streamId);
  }, [streamId, connected, maybeJoinRoom]);

  // Rejoin on reconnect is defined later after effective status is computed

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
    });
    bind(LivestreamEvents.EndStream, (data: any) => {
      console.log(
        "[viewer] frontend received",
        LivestreamEvents.EndStream,
        data
      );
      setSocketStatus("ENDED");
    });
    return () => {
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [streamId, socketOn]);

  // Join stream + record view when we become effectively live
  const recordedLiveViewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!streamId || !isLiveEffective) return;
    // Join as viewer when stream becomes live (deduped per epoch)
    if (isSignedIn && ownerStatus === "viewer") {
      maybeJoinStream(streamId);
    }
    // Record view once per stream on first live join (server updates totals/peaks)
    if (recordedLiveViewRef.current !== streamId) {
      const viewTokenId = (streamEntity?.tokenId ?? tokenId) as any;
      if (viewTokenId != null && isSignedIn) {
        (async () => {
          try {
            await recordView(viewTokenId as any);
            recordedLiveViewRef.current = streamId;
          } catch (e) {
            // non-fatal
            console.warn("[LiveStreamPlayer] recordView(live) failed", e);
          }
        })();
      } else {
        recordedLiveViewRef.current = streamId; // prevent repeat even if not signed in yet
      }
    }
  }, [
    streamId,
    isLiveEffective,
    maybeJoinStream,
    isSignedIn,
    ownerStatus,
    streamEntity?.tokenId,
    tokenId,
  ]);

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
            copy[idx] = { ...existing, optimistic: false } as Activity;
            return copy;
          }
          return prev;
        });
        return;
      }
      addActivity({
        status: StreamActivityType.MESSAGE,
        address: addr,
        meta: {
          username,
          content,
          avatarImageUrl: m?.user?.avatarImageUrl || meta?.avatarImageUrl,
        },
      });
    });
    bind(LivestreamEvents.JoinStream, (data: any) => {
      addActivity({
        status: StreamActivityType.JOINED,
        address: data?.user?.address,
        meta: {
          username: data?.user?.username,
          avatarImageUrl: data?.user?.avatarImageUrl,
        },
      });
    });
    bind(LivestreamEvents.LeaveStream, (data: any) => {
      addActivity({
        status: StreamActivityType.LEFT,
        address: data?.user?.address,
        meta: {
          username: data?.user?.username,
          avatarImageUrl: data?.user?.avatarImageUrl,
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
      const senderRaw =
        payload?.gift?.meta?.address ||
        payload?.gift?.address ||
        payload?.gift?.user?.address ||
        payload?.user?.address ||
        "";
      const sender = String(senderRaw || "").toLowerCase();
      const me = String((user?.walletAddress || user?.address || "")).toLowerCase();
      const now = Date.now();
      // If it's our own confirmed gift, try to confirm an optimistic one instead of adding a duplicate
      if (me && sender && sender === me) {
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
        meta: { username, amount: amt },
      });
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
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, [streamId, socketOn, addActivity, user?.walletAddress, user?.address]);

  // Emit LeaveStream on unmount / stream switch
  useEffect(() => {
    return () => {
      if (!streamId) return;
      try {
        if (didJoinRef.current) {
          socketEmitAuthed(LivestreamEvents.LeaveStream, { streamId });
        }
      } catch {}
    };
  }, [streamId, socketEmitAuthed]);

  // Emit LeaveStream on navigation blur and re-Join on focus
  useFocusEffect(
    useCallback(() => {
      // On focus: ensure room/join are sent if eligible
      if (streamId) {
        try {
          maybeJoinRoom(streamId);
          maybeJoinStream(streamId);
        } catch {}
      }
      // On blur: emit LeaveStream if we previously joined
      return () => {
        if (!streamId) return;
        try {
          if (didJoinRef.current) {
            socketEmitAuthed(LivestreamEvents.LeaveStream, { streamId });
          }
        } catch {}
      };
    }, [streamId, maybeJoinRoom, maybeJoinStream, socketEmitAuthed])
  );

  // Emit LeaveStream when app goes background/inactive, re-Join on active
  useEffect(() => {
    const onAppStateChange = (state: string) => {
      if (!streamId) return;
      if (state === "active") {
        // Re-join when coming back if eligible
        try {
          maybeJoinRoom(streamId);
          maybeJoinStream(streamId);
        } catch {}
      } else if (state === "background" || state === "inactive") {
        // Leave on background/inactive
        try {
          if (didJoinRef.current) {
            socketEmitAuthed(LivestreamEvents.LeaveStream, { streamId });
          }
        } catch {}
      }
    };
    const sub = AppState.addEventListener("change", onAppStateChange);
    return () => {
      try {
        sub.remove();
      } catch {}
    };
  }, [streamId, maybeJoinRoom, maybeJoinStream, socketEmitAuthed]);

  // Web: emit leave on page hide/unload; re-join on visibility return
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (!streamId) return;
    const onVisibility = () => {
      if (typeof document === "undefined") return;
      const hidden = (document as any).hidden === true;
      if (hidden) {
        try {
          if (didJoinRef.current) {
            socketEmitAuthed(LivestreamEvents.LeaveStream, { streamId });
          }
        } catch {}
      } else {
        try {
          maybeJoinRoom(streamId);
          maybeJoinStream(streamId);
        } catch {}
      }
    };
    const onBeforeUnload = () => {
      try {
        if (didJoinRef.current) {
          socketEmitAuthed(LivestreamEvents.LeaveStream, { streamId });
        }
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
  }, [streamId, maybeJoinRoom, maybeJoinStream, socketEmitAuthed]);

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

  // First-load redirect: if not ended and current user is owner, go to LiveProducer
  const redirectCheckedRef = useRef(false);
  useEffect(() => {
    if (redirectCheckedRef.current) return;
    if (streamLoading) return;
    if (!streamEntity) return;
    const status = String(streamEntity.status || "").toUpperCase();
    if (status === "ENDED") {
      redirectCheckedRef.current = true;
      setOwnerStatus("viewer");
      return;
    }
    const addr = (user?.walletAddress || user?.address) as string | undefined;
    if (!addr) {
      redirectCheckedRef.current = true;
      setOwnerStatus("viewer");
      return;
    }
    (async () => {
      try {
        const isOwner = await checkIfBroadcastOwner(addr, streamEntity);
        if (isOwner) {
          setOwnerStatus("owner");
          redirectCheckedRef.current = true;
          navigation.replace(ScreenNames.LiveProducer as any, {
            streamId: streamEntity._id || streamId,
            tokenId: streamEntity.tokenId,
          });
        } else {
          redirectCheckedRef.current = true;
          setOwnerStatus("viewer");
        }
      } catch {
        redirectCheckedRef.current = true;
        setOwnerStatus("viewer");
      }
    })();
  }, [
    streamLoading,
    streamEntity,
    user?.walletAddress,
    user?.address,
    navigation,
    streamId,
  ]);

  // Derive user vote for ActionsRow from live likesRecord
  const actionsUserVote = useMemo(() => {
    const addr = (user?.walletAddress || user?.address || "").toLowerCase();
    const rec = (streamEntity?.likesRecord || {}) as Record<string, boolean>;
    return addr && rec && !!rec[addr] ? "like" : null;
  }, [user?.walletAddress, user?.address, streamEntity?.likesRecord]);

  return (
    <View className="flex-1">
      {isEndedEffective ? (
        <View className="px-4 py-10 items-center justify-center bg-black/50 border-b border-white/10">
          <Text className="text-white font-semibold">
            This stream has ended
          </Text>
          {endedAtDate ? (
            <Text className="text-white/70 text-[12px] mt-1">
              Ended{" "}
              {formatDistance(new Date(endedAtDate), new Date(), {
                addSuffix: true,
              })}
            </Text>
          ) : null}
        </View>
      ) : isScheduledEffective ? (
        <View className="px-4 py-10 items-center justify-center bg-black/50 border-b border-white/10">
          <Text className="text-white font-semibold">
            This stream is scheduled
          </Text>
          {scheduledForDate ? (
            <Text className="text-white/70 text-[12px] mt-1">
              Scheduled for{" "}
              {formatDistance(new Date(scheduledForDate), new Date(), {
                addSuffix: true,
              })}
            </Text>
          ) : null}
        </View>
      ) : isOfflineEffective ? (
        <View className="px-4 py-10 items-center justify-center bg-black/50 border-b border-white/10">
          <Text className="text-white font-semibold">
            This stream is offline
          </Text>
          {/* {createdAtDate ? (
            <Text className="text-white/70 text-[12px] mt-1">
              Last updated {formatDistance(new Date(createdAtDate), new Date(), { addSuffix: true })}
            </Text>
          ) : null} */}
        </View>
      ) : (
        <VideoArea
          isTranscoding={false}
          isLockedOrPPV={!!isLockedOrPPV}
          lockedFetchLoading={streamLoading && isLockedOrPPV}
          effectiveVideoUrl={effectiveVideoUrl}
          accessInfo={resolvedAccessInfo}
          streamInfo={streamEntity?.streamInfo as any}
          minter={(streamEntity?.address as any) || (minterProp as any)}
          tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
          onProgress={() => {
            /* no view recording for live playback here */
          }}
          isLive={true}
        />
      )}
      {/* Compact meta row under player */}
      <View className="px-4 py-2 bg-black/40 border-t border-white/10 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View
            className="w-2 h-2 rounded-full mr-2"
            style={{ backgroundColor: isLiveEffective ? "#ef4444" : "#6b7280" }}
          />
          <Text className="text-white font-semibold text-[11px] mr-3">
            {isLiveEffective
              ? "LIVE"
              : isEndedEffective
              ? "ENDED"
              : isScheduledEffective
              ? "SCHEDULED"
              : "OFFLINE"}
          </Text>
          {isEndedEffective ? (
            endedDurationText ? (
              <Text className="text-white/70 text-[11px]">
                Duration {endedDurationText}
              </Text>
            ) : null
          ) : !isOfflineEffective && createdAtDate ? (
            <Text className="text-white/70 text-[11px]">
              {formatDistance(new Date(createdAtDate), new Date(), {
                addSuffix: true,
              })}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center">
          <Eye color="#fff" size={14} />
          <Text className="text-white/80 text-[11px] ml-1">
            {Math.max(0, liveViewers)}
          </Text>
          <Text className="text-white/60 text-[11px] ml-3">
            Peak: {Math.max(liveViewers, peakViewers)}
          </Text>
        </View>
      </View>
      {/* Body: top details fixed + chat fills to bottom (only chat scrolls) */}
      <View className="flex-1">
        <View className="px-4 pt-2">
          <Text
            className="text-theme-neutrals-100 font-semibold text-base"
            numberOfLines={2}
          >
            {(resolvedTitle || "").slice(0, 60)}
            {resolvedTitle && resolvedTitle.length > 60 ? "…" : ""}
          </Text>
          {/* <Text className="text-theme-neutrals-400 text-[11px] mt-1">
            {resolvedViews.toLocaleString()} views • {formatCompactNumber(resolvedTotalTips)} tips • {formatDistance(new Date(createdAtDate), new Date(), { addSuffix: true })}
            {formatCompactNumber(resolvedTotalTips)} tips 
          </Text> */}
          <ActionsRow
            tokenId={(streamEntity?.tokenId as any) || (tokenId as any)}
            minter={(streamEntity?.address as any) || (minterProp as any)}
            likes={liveLikes}
            dislikes={0}
            userVote={actionsUserVote}
            chainId={undefined as any}
            mintTxHash={undefined as any}
            isLive={true}
            streamId={streamId as any}
            liveActive={!!isLiveEffective}
            recipientAddress={(streamEntity?.address as any) || ""}
            stream={streamEntity}
            onGiftSent={onGiftOptimistic}
          />
          <CreatorRow
            key={
              creatorLoading
                ? "creator-loading"
                : `creator-${
                    creator?.walletAddress || creator?.address || "none"
                  }`
            }
            loading={creatorLoading}
            creator={creator}
            viewerAddress={(user?.walletAddress || user?.address) as string}
            isFollowing={isFollowing}
            followLoading={followLoading}
            onFollow={handleFollow}
            onUnfollow={handleUnfollow}
            fallbackMinter={minterProp}
          />
          <DescriptionBlock
            description={resolvedDescription}
            showDesc={true}
            onToggle={() => {
              /* could add collapsible later */
            }}
          />
        </View>
        {/* Chat section */}
        <View className="px-4 pb-4 flex-1">
          <View className="mt-2 rounded-2xl border border-white/10 overflow-hidden flex-1">
            <LiveChatPanel
              streamId={(streamId as any) || ""}
              live={true}
              visible
              onClose={() => {
                /* no-op in stacked mode */
              }}
              chatEnabled={!!canChat && !!isLiveEffective && !!(streamEntity as any)?.settings?.chat?.enabled}
              autoJoinRoom={false}
              phase={
                isScheduledEffective
                  ? "scheduled"
                  : isEndedEffective
                  ? "ended"
                  : "live"
              }
              socketEmit={(evt, payload, ack) => {
                if (
                  evt === LivestreamEvents.JoinStream &&
                  ownerStatus !== "viewer"
                )
                  return;
                // Remember optimistic message key right before sending to server
                if (evt === LivestreamEvents.SendMessage && payload?.content) {
                  const addr = (
                    user?.walletAddress ||
                    user?.address ||
                    ""
                  ).toLowerCase();
                  const username = (user as any)?.username;
                  const key = `${(
                    addr ||
                    username ||
                    ""
                  ).toLowerCase()}::${String(payload?.content).trim()}`;
                  const idx = activities.length; // predicted index after push
                  try {
                    (rememberOptimistic as any)(key, idx);
                  } catch {}
                }
                socketEmitAuthed(evt, payload, ack);
              }}
              activities={activities}
              addActivity={addActivity}
              mode="stack"
            />
            {(!isLiveStatus ||
              !canChat ||
              isEndedStatus ||
              isScheduledStatus) && (
              <View className="px-4 py-3 bg-black/40 border-t border-white/10">
                <Text className="text-white/60 text-[11px]">
                  {isScheduledStatus
                    ? "Chat will open when the stream goes live."
                    : isEndedStatus
                    ? "Chat is read-only. Stream has ended."
                    : !isLiveStatus
                    ? "Chat is available when the stream is live."
                    : "Sign in and unlock access to participate in chat."}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

export default LiveStreamPlayer;
