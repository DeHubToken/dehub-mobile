import { useState, useRef, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid, AppState } from "react-native";
import createAgoraRtcEngine, {
  RtcSurfaceView,
  type IRtcEngine,
  type IRtcEngineEventHandler,
  type RtcConnection,
  type VideoCanvas,
  VideoSourceType,
  RenderModeType,
  ChannelProfileType,
  ClientRoleType,
  UserOfflineReasonType,
  type ChannelMediaOptions,
} from "react-native-agora";
import { supabase, fetchAgoraToken } from "../services/supabase";
import { AGORA_APP_ID } from "../config/agora.config";
import { useAuth } from "../context/AuthContext";
import { createLogger } from "../libs/logger";

const log = createLogger("useCall");

export interface CallSession {
  id: string;
  caller_address: string;
  recipient_address: string;
  status: "ringing" | "connected" | "ended";
  call_type: "audio" | "video";
  signaling_data?: any;
  created_at: string;
}

export interface UseCallReturn {
  isCallActive: boolean;
  isIncoming: boolean;
  currentCall: CallSession | null;
  isConnecting: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  callDuration: string;
  remoteUid: number | null;
  peerAddress: string;
  localCanvas: VideoCanvas;
  remoteCanvas: VideoCanvas;
  startCall: (recipientAddress: string, callType?: "audio" | "video") => Promise<void>;
  endCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  setCallMessageHandler: (handler: ((content: string) => void) | null) => void;
}

let engineInstance: IRtcEngine | null = null;
let engineInitialized = false;

function getEngine(): IRtcEngine {
  if (!engineInstance) {
    engineInstance = createAgoraRtcEngine();
  }
  return engineInstance;
}

export function useCall(): UseCallReturn {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [callDuration, setCallDuration] = useState("00:00");
  const [remoteUid, setRemoteUid] = useState<number | null>(null);

  const { user } = useAuth();
  const userAddress = (user?.walletAddress || user?.address || "").toLowerCase();

  // Stable refs for callbacks
  const currentCallRef = useRef<CallSession | null>(null);
  useEffect(() => { currentCallRef.current = currentCall; }, [currentCall]);

  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callMessageHandlerRef = useRef<((content: string) => void) | null>(null);
  const setCallMessageHandler = useCallback((handler: ((content: string) => void) | null) => {
    callMessageHandlerRef.current = handler;
  }, []);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const watchChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Canvas configs for RtcSurfaceView
  const localCanvas: VideoCanvas = {
    uid: 0,
    sourceType: VideoSourceType.VideoSourceCamera,
    renderMode: RenderModeType.RenderModeHidden,
  };

  const remoteCanvas: VideoCanvas = {
    uid: remoteUid ?? 0,
    sourceType: VideoSourceType.VideoSourceRemote,
    renderMode: RenderModeType.RenderModeHidden,
  };

  // ── Agora engine ───────────────────────────────────────────────────────────

  const initEngine = useCallback(async (): Promise<IRtcEngine> => {
    const engine = getEngine();
    if (!engineInitialized) {
      if (!AGORA_APP_ID) throw new Error("AGORA_APP_ID is not configured");
      engine.registerEventHandler(engineEventHandlerRef.current);
      await engine.initialize({ appId: AGORA_APP_ID });
      engineInitialized = true;
      log.info("Agora engine initialized");
    }
    return engine;
  }, []);

  const cleanupEngine = useCallback(async () => {
    const engine = getEngine();
    try {
      await engine.leaveChannel();
    } catch (e) {
      log.warn("Engine leave error (non-fatal):", e);
    }
    setRemoteUid(null);
    setIsCallActive(false);
    setIsConnecting(false);
    setIsCameraOff(true);
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallDuration("00:00");
  }, []);

  // ── Event handler (registered once; uses refs/state setters which are stable) ─

  const engineEventHandlerRef = useRef<IRtcEngineEventHandler>({
    onUserJoined: (_connection: RtcConnection, remoteUid_: number, _elapsed: number) => {
      log.info("Remote user joined:", remoteUid_);
      // Clear ring timeout so a connected call is never auto-cancelled
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current);
        callTimeoutRef.current = null;
      }
      if (currentCallRef.current) {
        currentCallRef.current = { ...currentCallRef.current, status: "connected" };
      }
      setRemoteUid(remoteUid_);
      setIsCallActive(true);
      setIsConnecting(false);
      // start timer via ref
      const t0 = Date.now();
      const tick = () => {
        const secs = Math.floor((Date.now() - t0) / 1000);
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        setCallDuration(`${m}:${s}`);
      };
      tick();
      callTimerRef.current = setInterval(tick, 1000);
    },
    onUserOffline: (_connection: RtcConnection, _remoteUid: number, _reason: UserOfflineReasonType) => {
      log.info("Remote user offline");
      setRemoteUid(null);
      setIsCallActive(false);
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
        callTimerRef.current = null;
      }
      setCallDuration("00:00");
      const call = currentCallRef.current;
      if (call) {
        supabase.from("call_sessions").update({ status: "ended" }).eq("id", call.id);
      }
      setCurrentCall(null);
    },
  });

  // ── Join channel ───────────────────────────────────────────────────────────

  const joinChannel = useCallback(async (
    callSession: CallSession,
    callType: "audio" | "video",
  ): Promise<boolean> => {
    const channelName = `dm-call-${callSession.id}`;
    const tokenData = await fetchAgoraToken(channelName);
    if (!tokenData) return false;

    try {
      const engine = await initEngine();
      engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.enableAudio();
      if (callType === "video") {
        if (Platform.OS === "android") {
          const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            log.error("Camera permission denied");
            return false;
          }
          // Wait for app to fully regain focus after the permission dialog closes
          await new Promise(r => setTimeout(r, 400));
        }
        setIsCameraOff(false);
        // Wait for React re-render + native surface creation before starting preview
        await new Promise(r => setTimeout(r, 300));
        engine.enableVideo();
        engine.startPreview();
        engine.muteLocalVideoStream(false);
      }
      const options: ChannelMediaOptions = {
        publishMicrophoneTrack: true,
        publishCameraTrack: callType === "video",
        autoSubscribeAudio: true,
        autoSubscribeVideo: callType === "video",
      };
      engine.joinChannel(tokenData.token, channelName, tokenData.uid ?? 0, options);
      return true;
    } catch (err) {
      log.error("Failed to join Agora channel:", err);
      return false;
    }
  }, [initEngine]);

  // ── Realtime subscriptions ─────────────────────────────────────────────────

  const subscribeIncomingCalls = useCallback(() => {
    if (!userAddress) return;
    if (realtimeChannelRef.current) return; // already subscribed

    const channel = supabase
      .channel("incoming-calls")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_sessions", filter: `recipient_address=eq.${userAddress}` },
        (payload: any) => {
          const call = payload.new as CallSession;
          if (call.status === "ringing") {
            setCurrentCall(call);
            setIsIncoming(true);
            // Auto-dismiss after 45s
            callTimeoutRef.current = setTimeout(() => {
              setIsIncoming(false);
              setCurrentCall(null);
            }, 45_000);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "call_sessions", filter: `recipient_address=eq.${userAddress}` },
        (payload: any) => {
          const call = payload.new as CallSession;
          if (call.status === "ended") {
            setIsIncoming(false);
            setCurrentCall(null);
            cleanupEngine();
          }
        },
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, [userAddress, cleanupEngine]);

  const unsubscribeIncomingCalls = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
  }, []);

  useEffect(() => {
    subscribeIncomingCalls();
    return () => {
      unsubscribeIncomingCalls();
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      if (watchChannelRef.current) {
        supabase.removeChannel(watchChannelRef.current);
        watchChannelRef.current = null;
      }
    };
  }, [subscribeIncomingCalls, unsubscribeIncomingCalls]);

  // ── Polling fallback (every 15s) in case realtime misses the event ─────────

  const isCallActiveRef = useRef(isCallActive);
  const isIncomingRef = useRef(isIncoming);
  const isConnectingRef = useRef(isConnecting);
  useEffect(() => { isCallActiveRef.current = isCallActive; }, [isCallActive]);
  useEffect(() => { isIncomingRef.current = isIncoming; }, [isIncoming]);
  useEffect(() => { isConnectingRef.current = isConnecting; }, [isConnecting]);

  useEffect(() => {
    if (!userAddress) return;

    const poll = async () => {
      if (isCallActiveRef.current || isIncomingRef.current || isConnectingRef.current) return;
      // CallProvider wraps the whole navigator, so this interval lives for the
      // entire app session. Without this guard it keeps hitting Supabase every
      // 15s while backgrounded. Realtime (subscribeIncomingCalls) plus push are
      // the backgrounded path; this is only the foreground fallback. Mirrors
      // hooks/useProviderLifecycle.ts:407.
      if (AppState.currentState !== "active") return;
      const { data } = await supabase
        .from("call_sessions")
        .select("*")
        .eq("recipient_address", userAddress)
        .eq("status", "ringing")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!data) return;
      const age = Date.now() - new Date(data.created_at).getTime();
      if (age > 45_000) return;
      const call = data as CallSession;
      setCurrentCall(call);
      currentCallRef.current = call;
      setIsIncoming(true);
      callTimeoutRef.current = setTimeout(() => {
        setIsIncoming(false);
        setCurrentCall(null);
      }, 45_000 - age);
    };

    void poll();
    const interval = setInterval(poll, 15_000);
    // Poll immediately on foreground so a call that started while the app was
    // backgrounded is picked up at once rather than up to 15s later.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void poll();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [userAddress]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const startCall = useCallback(async (recipientAddress: string, callType: "audio" | "video" = "audio") => {
    if (!userAddress) return;
    const normalizedRecipient = recipientAddress.toLowerCase();

    // Set optimistic state immediately so the modal opens without waiting for Supabase
    const optimistic: CallSession = {
      id: "pending",
      caller_address: userAddress,
      recipient_address: normalizedRecipient,
      status: "ringing",
      call_type: callType,
      created_at: new Date().toISOString(),
    };
    setCurrentCall(optimistic);
    currentCallRef.current = optimistic;
    setIsConnecting(true);

    try {
      const { data, error } = await supabase
        .from("call_sessions")
        .insert({
          caller_address: userAddress,
          recipient_address: normalizedRecipient,
          status: "ringing",
          call_type: callType,
        })
        .select()
        .single();

      if (error) throw error;
      const session = data as CallSession;
      setCurrentCall(session);
      currentCallRef.current = session;

      // Notify DM chat that a call was initiated
      callMessageHandlerRef.current?.(callType === "video" ? "📹 Video call" : "📞 Voice call");

      // Join Agora immediately (like web) — don't wait for recipient to accept.
      // When recipient accepts they join too and onUserJoined fires.
      await joinChannel(session, callType);

      // Ring timeout: cancel if not answered in 30s
      callTimeoutRef.current = setTimeout(async () => {
        const call = currentCallRef.current;
        if (call && call.status === "ringing") {
          supabase.from("call_sessions").update({ status: "ended" }).eq("id", call.id).then(() => {}, () => {});
          callMessageHandlerRef.current?.(call.call_type === "video" ? "📵 Missed video call" : "📵 Missed voice call");
          setCurrentCall(null);
          setIsConnecting(false);
          await cleanupEngine();
        }
      }, 30_000);

      const cleanupWatchChannel = () => {
        if (watchChannelRef.current) {
          supabase.removeChannel(watchChannelRef.current);
          watchChannelRef.current = null;
        }
      };

      // Watch for recipient accept/reject
      watchChannelRef.current = supabase
        .channel(`call-${session.id}-watch`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "call_sessions", filter: `id=eq.${session.id}` },
          async (payload: any) => {
            const updated = payload.new as CallSession;
            if (updated.status === "ended") {
              setIsConnecting(false);
              setCurrentCall(null);
              cleanupWatchChannel();
              await cleanupEngine();
            }
          },
        )
        .subscribe();
    } catch (err) {
      log.error("Failed to start call:", err);
      setIsConnecting(false);
      setCurrentCall(null);
      currentCallRef.current = null;
    }
  }, [userAddress, joinChannel]);

  const endCall = useCallback(async () => {
    // Clear UI immediately — don't wait for Supabase
    const call = currentCallRef.current;
    setCurrentCall(null);
    currentCallRef.current = null;
    setIsIncoming(false);
    setIsConnecting(false);
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current);
      callTimeoutRef.current = null;
    }
    if (watchChannelRef.current) {
      supabase.removeChannel(watchChannelRef.current);
      watchChannelRef.current = null;
    }
    // Notify DM chat if call was connected (has duration)
    if (call?.status === "connected") {
      const typeLabel = call.call_type === "video" ? "Video" : "Voice";
      const durLabel = callTimerRef.current ? callDuration : null;
      const msg = durLabel ? `📞 ${typeLabel} call ended · ${durLabel}` : `📞 ${typeLabel} call ended`;
      callMessageHandlerRef.current?.(msg);
    }
    // Supabase update + engine cleanup in background
    if (call && call.id !== "pending") {
      supabase.from("call_sessions").update({ status: "ended" }).eq("id", call.id).then(() => {}, () => {});
    }
    await cleanupEngine();
  }, [cleanupEngine, callDuration]);

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call) return;

    setIsIncoming(false);
    setIsConnecting(true);

    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);

    // Mark connected
    await supabase.from("call_sessions").update({ status: "connected" }).eq("id", call.id);

    const success = await joinChannel(call, call.call_type);
    if (!success) {
      setIsConnecting(false);
      setCurrentCall(null);
    }
  }, [joinChannel]);

  const rejectCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (call) {
      await supabase.from("call_sessions").update({ status: "ended" }).eq("id", call.id);
    }
    setIsIncoming(false);
    setCurrentCall(null);
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
  }, []);

  const toggleMute = useCallback(() => {
    const engine = getEngine();
    const next = !isMuted;
    engine.muteLocalAudioStream(next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const engine = getEngine();
    if (isCameraOff) {
      engine.enableVideo();
      engine.startPreview();
      engine.muteLocalVideoStream(false);
      setIsCameraOff(false);
    } else {
      engine.muteLocalVideoStream(true);
      engine.stopPreview();
      setIsCameraOff(true);
    }
  }, [isCameraOff]);

  const switchCamera = useCallback(() => {
    getEngine().switchCamera();
  }, []);

  // The "other person" in the call — works for both caller and recipient
  const peerAddress = currentCall
    ? currentCall.caller_address === userAddress
      ? currentCall.recipient_address
      : currentCall.caller_address
    : "";

  return {
    isCallActive,
    isIncoming,
    currentCall,
    isConnecting,
    isMuted,
    isCameraOff,
    callDuration,
    remoteUid,
    peerAddress,
    localCanvas,
    remoteCanvas,
    startCall,
    endCall,
    acceptCall,
    rejectCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    setCallMessageHandler,
  };
}
