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
import { useStreamDetails } from "../hooks/useStreamDetails";
import { useEphemeralMessages } from "../hooks/useEphemeralMessages";
import GlassModal from "../components/ui/GlassModal";
import { LivestreamEvents } from "../services/enums/livestream.enum";
import { toastSuccess } from "../libs/toast";
import { StreamActivityType } from "../services/enums/livestream.enum";
import { ScreenNames } from "../navigation/ScreenNames";

type RouteParams = {
  streamId?: string;
  tokenId?: number;
  ingestUrl?: string;
  streamKey?: string;
};

const LiveProducerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { streamId, tokenId, ingestUrl, streamKey } = (route.params ||
    {}) as RouteParams;
  const { on: socketOn, emitAuthed: socketEmitAuthed, connected } = useWebSocket();
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
  // Centralized chat activity list for LiveChatPanel
  const [chatActivities, setChatActivities] = useState<Array<{
    status: any;
    address?: string;
    createdAt?: number;
    meta?: any;
  }>>([]);
  const addChatActivity = useCallback((a: any) => {
    setChatActivities((prev) => prev.concat({ ...a, createdAt: Date.now() }).slice(-400));
  }, []);
  // Single-capture: WebRTCPublisher handles preview + publish
  // Realtime dynamic counters (decoupled from initial streamEntity)
  const [liveViewers, setLiveViewers] = useState<number>(0);
  const [peakViewers, setPeakViewers] = useState<number>(0);
  const [liveLikes, setLiveLikes] = useState<number>(0);
  const [totalTips, setTotalTips] = useState<number>(0);
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
    console.log('[LiveProducer] Reconnected, rejoin room');
    socketEmitAuthed(LivestreamEvents.JoinRoom, { streamId });
    if (stage === 'starting' || stage === 'live') {
      socketEmitAuthed(LivestreamEvents.JoinStream, { streamId });
    }
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
      console.log("[LiveProducer] Socket StartStream event", data);
      setStartedAt((prev) => prev || Date.now());
      addChatActivity({ status: StreamActivityType.START, meta: { message: 'Stream has started.' } });
    });
    make(LivestreamEvents.EndStream, (data) => {
      console.log("[LiveProducer] Socket EndStream event", data);
      // Stage change handled by hook via bind, but we can snapshot viewers
  addChatActivity({ status: StreamActivityType.END, meta: { message: 'Stream has ended.' } });
    });
    make(LivestreamEvents.ViewCountUpdate, ({ viewerCount }: any) => {
      console.log("[LiveProducer] Socket ViewCountUpdate event", {
        viewerCount,
      });
      const vc = viewerCount || 0;
      const meta = viewUpdateMetaRef.current;
      meta.latest = vc;
      const now = Date.now();
      const push = () => {
        setLiveViewers(meta.latest);
        setPeakViewers((p) => (meta.latest > p ? meta.latest : p));
        meta.last = Date.now();
      };
      if (now - meta.last >= 500) {
        push();
      } else if (!meta.timer) {
        meta.timer = setTimeout(() => {
          if (meta.timer) {
            clearTimeout(meta.timer);
            meta.timer = null;
          }
          push();
        }, 500 - (now - meta.last));
      }
    });
    make(LivestreamEvents.LikeStream, (payload: any) => {
      console.log("[LiveProducer] Socket LikeStream event", payload);
      if (typeof payload?.likes === "number") setLiveLikes(payload.likes);
    });
    make(LivestreamEvents.TipStreamer, (payload: any) => {
      console.log("[LiveProducer] Socket TipStreamer event", payload);
      const amt = Number(payload?.gift?.meta?.amount || 0);
      if (!isNaN(amt) && amt > 0) setTotalTips((t) => t + amt);
      // Also reflect in chat activity
      const gift = payload?.gift;
      addChatActivity({
        status: StreamActivityType.TIP,
        address: gift?.meta?.address,
        meta: { username: gift?.meta?.username || gift?.meta?.displayName, amount: Number(gift?.meta?.amount) || 0 },
      });
    });
    // Chat message and presence events
    make(LivestreamEvents.SendMessage, (payload: any) => {
      const m = payload?.message || payload;
      const meta = m?.meta || payload?.meta || {};
      addChatActivity({
        status: StreamActivityType.MESSAGE,
        address: m?.user?.address || meta?.address,
        meta: {
          username: m?.user?.username || meta?.username,
          content: meta?.content || m?.content || m?.meta?.content,
          avatarImageUrl: m?.user?.avatarImageUrl || meta?.avatarImageUrl,
        },
      });
      const textContent = meta?.content || m?.content || m?.meta?.content;
      if (textContent) {
        addEphemeral({
          id: String(Date.now()) + '-' + Math.random().toString(36).slice(2),
          user: meta?.username || m?.user?.username || meta?.address || 'user',
          message: textContent,
          createdAt: Date.now(),
        } as any);
      }
    });
    make(LivestreamEvents.JoinStream, (data: any) => {
      addChatActivity({
        status: StreamActivityType.JOINED,
        address: data?.user?.address,
        meta: { username: data?.user?.username, avatarImageUrl: data?.user?.avatarImageUrl },
      });
    });
    make(LivestreamEvents.LeaveStream, (data: any) => {
      addChatActivity({
        status: StreamActivityType.LEFT,
        address: data?.user?.address,
        meta: { username: data?.user?.username, avatarImageUrl: data?.user?.avatarImageUrl },
      });
    });
    return () => {
      console.log("[LiveProducer] unbinding socket listeners");
      subs.forEach((u) => {
        try {
          u();
        } catch {}
      });
      const meta = viewUpdateMetaRef.current;
      if (meta.timer) {
        clearTimeout(meta.timer);
        meta.timer = null;
      }
    };
  }, [streamId, socketOn]);
  const [publishStats, setPublishStats] = useState<{
    fps?: number;
    bitrateKbps?: number;
    dropped?: number;
  }>({});

  const onStart = useCallback(() => {
    console.log("[LiveProducer] onStart invoked. Current stage:", stage);
    // Ensure video is enabled before starting publishing to avoid blank preview
    setCameraOff(false);
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
  }, [start, stage]);

  const onEnd = useCallback(() => {
    console.log("[LiveProducer] onEnd invoked. Current stage:", stage);
    // Fire-and-forget end; don't wait for Livepeer. Navigating back will unmount publisher and stop media immediately.
    end().catch(() => {});
    // Mark ended to avoid duplicate end on unmount
    endedRef.current = true;
    toastSuccess("Livestream ended");
    navigation.goBack();
  }, [end, navigation, stage]);

  const requestClose = useCallback(() => {
    // End stream immediately if live-ish; do not wait
    if (stage === "starting" || stage === "live" || stage === "ending") {
      console.log(
        "[LiveProducer] requestClose -> immediate end without waiting"
      );
      end().catch(() => {});
      endedRef.current = true;
      toastSuccess("Livestream ended");
    }
    navigation.goBack();
  }, [navigation, stage, end]);

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
    if (status === "live" || status === "ended") {
      setRedirecting(true);
      console.log(
        "[LiveProducer] redirecting to LiveViewer due to initial status",
        status
      );
      navigation.replace(ScreenNames.LiveViewer as any, {
        tokenId: tokenId || (streamEntity as any)?.tokenId,
        streamKey: streamKeyValue || streamKey,
        streamId: streamEntity?._id
      });
    }
  }, [
    streamLoading,
    streamEntity,
    streamKeyValue,
    tokenId,
    streamKey,
    navigation,
  ]);

  // Network offline detection -> end stream to avoid ghost live sessions
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      if (state.isConnected === false || state.isInternetReachable === false) {
        if (stage === "live" || stage === "starting") {
          console.log(
            "[LiveProducer] network offline detected -> ending stream"
          );
          end().catch(() => {});
          endedRef.current = true;
          toastSuccess("Livestream ended");
          navigation.goBack();
        }
      }
    });
    return () => unsub();
  }, [stage, end, navigation]);

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
                : "Setting up publisher…"
              : undefined
          }
          onRequestClose={requestClose}
          onRequestEndConfirmation={openEndConfirm}
        />

        {/* Side chat panel (overlay) */}
        {chatVisible && !uiHidden && (
          <LiveChatPanel
            streamId={streamId || streamEntity?._id || ""}
            live={stage === "live"}
            visible
            onClose={() => setChatVisible(false)}
            chatEnabled={true}
            socketEmit={(evt, payload, ack) => socketEmitAuthed(evt, payload, ack)}
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
