import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Platform, PermissionsAndroid, AppState } from "react-native";
import createAgoraRtcEngine, {
  type IRtcEngine, type IRtcEngineEventHandler, type VideoCanvas,
  VideoSourceType, RenderModeType, ChannelProfileType, ClientRoleType,
} from "react-native-agora";
import { supabase, fetchAgoraToken } from "../services/supabase";
import { AGORA_APP_ID } from "../config/agora.config";
import { useAuth } from "../context/AuthContext";
import { createLogger } from "../libs/logger";
import { apiClient } from "../libs/api.client";
import { formatCallDuration } from "../libs/callDuration";
import { visualActivity } from "../libs/visualActivity";
import { revokeAudioFocus } from "../libs/audioFocus";
import { revokeAllFeedVideo } from "../libs/feedVideoFocus";

const log = createLogger("useCall");
export interface CallSession {
  id: string; caller_address: string; recipient_address: string;
  status: "ringing" | "connected" | "ended"; call_type: "audio" | "video";
  signaling_data?: any; created_at: string;
}
export interface UseCallReturn {
  isCallActive: boolean; isIncoming: boolean; currentCall: CallSession | null;
  isConnecting: boolean; isMuted: boolean; isSpeakerOn: boolean; isCameraOff: boolean;
  callStartedAt: number | null; remoteUid: number | null; peerAddress: string;
  localCanvas: VideoCanvas; remoteCanvas: VideoCanvas;
  startCall: (recipientAddress: string, callType?: "audio" | "video") => Promise<void>;
  endCall: () => void; acceptCall: () => void; rejectCall: () => void;
  toggleMute: () => void; toggleSpeaker: () => void; toggleCamera: () => void; switchCamera: () => void;
  setCallMessageHandler: (handler: ((content: string) => void) | null) => void;
  isMinimized: boolean; setMinimized: (minimized: boolean) => void;
}
const LOCAL_CANVAS: VideoCanvas = {
  uid: 0, sourceType: VideoSourceType.VideoSourceCamera, renderMode: RenderModeType.RenderModeHidden,
};
type CallMedia = { engine: IRtcEngine; handler: IRtcEngineEventHandler; closed: boolean };

export function useCall(): UseCallReturn {
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncoming, setIsIncoming] = useState(false);
  const [currentCall, setCurrentCall] = useState<CallSession | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(true);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [isMinimized, setMinimized] = useState(false);
  const { user } = useAuth();
  const userAddress = (user?.walletAddress || user?.address || "").toLowerCase();
  const currentCallRef = useRef<CallSession | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const joiningRef = useRef(false);
  const mediaRef = useRef<CallMedia | null>(null);
  const callTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callMessageHandlerRef = useRef<((content: string) => void) | null>(null);
  const setCallMessageHandler = useCallback((handler: ((content: string) => void) | null) => {
    callMessageHandlerRef.current = handler;
  }, []);
  const publishCall = useCallback((call: CallSession | null) => {
    currentCallRef.current = call;
    setCurrentCall(call);
  }, []);
  const clearTimeouts = useCallback(() => {
    if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
    callTimeoutRef.current = null;
  }, []);
  const markEnded = useCallback(async (call: CallSession | null) => {
    if (!call || call.id === "pending") return;
    try { await supabase.from("call_sessions").update({ status: "ended" }).eq("id", call.id); }
    catch (error) { log.warn("Call status update failed", error); }
  }, []);
  const disposeMedia = useCallback((media: CallMedia | null) => {
    if (!media || media.closed) return;
    media.closed = true;
    const engine = media.engine;
    // Each operation is independent: one native failure must not skip release.
    const operations = [
      () => engine.unregisterEventHandler(media.handler),
      () => engine.stopPreview(),
      () => engine.muteLocalVideoStream(true),
      () => engine.enableLocalVideo(false),
      () => engine.muteLocalAudioStream(true),
      () => engine.enableLocalAudio(false),
      () => engine.leaveChannel(),
      () => engine.release(),
    ];
    operations.forEach(operation => { try { operation(); } catch (error) { log.warn("Call teardown error", error); } });
  }, []);
  const endCall = useCallback(async () => {
    const call = currentCallRef.current;
    const startedAt = startedAtRef.current;
    generationRef.current += 1;
    joiningRef.current = false;
    publishCall(null);
    clearTimeouts();
    const media = mediaRef.current;
    mediaRef.current = null;
    disposeMedia(media);
    startedAtRef.current = null;
    setCallStartedAt(null); setRemoteUid(null); setIsCallActive(false);
    setIsIncoming(false); setIsConnecting(false); setMinimized(false);
    setIsMuted(false); setIsSpeakerOn(false); setIsCameraOff(true);
    visualActivity.setCall(false, false);
    if (call && startedAt != null) {
      callMessageHandlerRef.current?.(`📞 ${call.call_type === "video" ? "Video" : "Voice"} call ended · ${formatCallDuration(startedAt)}`);
    }
    await markEnded(call);
  }, [publishCall, clearTimeouts, disposeMedia, markEnded]);

  const joinChannel = useCallback(async (call: CallSession, generation: number): Promise<boolean> => {
    const current = () => generationRef.current === generation && currentCallRef.current?.id === call.id;
    let media: CallMedia | null = null;
    try {
      const token = await fetchAgoraToken(`dm-call-${call.id}`);
      if (!current()) return false;
      if (!token || !AGORA_APP_ID) throw new Error("Call credentials unavailable");
      if (Platform.OS === "android") {
        const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          ...(call.call_type === "video" ? [PermissionsAndroid.PERMISSIONS.CAMERA] : [])];
        const granted = await PermissionsAndroid.requestMultiple(permissions);
        if (!current()) return false;
        if (permissions.some(permission => granted[permission] !== PermissionsAndroid.RESULTS.GRANTED)) {
          throw new Error("Call media permission denied");
        }
      }
      if (!current()) return false;
      revokeAllFeedVideo(); revokeAudioFocus();
      const engine = createAgoraRtcEngine();
      const handler: IRtcEngineEventHandler = {
        onUserJoined: (_connection, uid) => {
          if (!current()) return;
          clearTimeouts();
          publishCall({ ...currentCallRef.current!, status: "connected" });
          setRemoteUid(uid); setIsCallActive(true); setIsConnecting(false);
          if (startedAtRef.current == null) {
            startedAtRef.current = Date.now();
            setCallStartedAt(startedAtRef.current);
          }
        },
        onUserOffline: () => { if (current()) void endCall(); },
      };
      media = { engine, handler, closed: false };
      mediaRef.current = media;
      const initialized = engine.initialize({ appId: AGORA_APP_ID });
      if (initialized < 0) throw new Error(`Call initialization failed: ${initialized}`);
      engine.registerEventHandler(handler);
      engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.enableAudio();
      engine.enableLocalAudio(true);
      engine.muteLocalAudioStream(false);
      const speaker = call.call_type === "video";
      engine.setDefaultAudioRouteToSpeakerphone(speaker);
      engine.setEnableSpeakerphone(speaker);
      setIsSpeakerOn(speaker);
      if (call.call_type === "video") {
        setIsCameraOff(false);
        // Let the call modal commit its local surface before preview begins.
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!current() || media.closed) { disposeMedia(media); return false; }
        engine.enableVideo();
        engine.enableLocalVideo(true);
        engine.startPreview();
        engine.muteLocalVideoStream(false);
      }
      if (!current() || media.closed) { disposeMedia(media); return false; }
      const joined = engine.joinChannel(token.token, `dm-call-${call.id}`, token.uid ?? 0, {
        publishMicrophoneTrack: true, publishCameraTrack: call.call_type === "video",
        autoSubscribeAudio: true, autoSubscribeVideo: call.call_type === "video",
      });
      if (joined < 0) throw new Error(`Call join failed: ${joined}`);
      return true;
    } catch (error) {
      disposeMedia(media);
      if (current()) log.error("Call connection failed", error);
      return false;
    }
  }, [clearTimeouts, publishCall, disposeMedia, endCall]);

  const checkForRing = useCallback(async () => {
    if (!userAddress || currentCallRef.current) return;
    const generation = generationRef.current;
    const { data } = await supabase.from("call_sessions").select("*")
      .eq("recipient_address", userAddress).eq("status", "ringing")
      .order("created_at", { ascending: false }).limit(1).single();
    if (!data || generationRef.current !== generation || currentCallRef.current) return;
    const age = Date.now() - new Date(data.created_at).getTime();
    if (!Number.isFinite(age) || age > 45_000) return;
    const ringGeneration = ++generationRef.current;
    publishCall(data as CallSession);
    setIsIncoming(true); setMinimized(false);
    visualActivity.setCall(true, true);
    revokeAllFeedVideo(); revokeAudioFocus();
    callTimeoutRef.current = setTimeout(() => {
      if (generationRef.current === ringGeneration && !joiningRef.current) void endCall();
    }, Math.max(0, 45_000 - age));
  }, [userAddress, publishCall, endCall]);

  useEffect(() => {
    if (!userAddress) return;
    const channel = supabase.channel(`call:${userAddress}`, { config: { private: true } })
      .on("broadcast", { event: "call" }, message => {
        const ping = message.payload as Pick<CallSession, "id" | "status"> | undefined;
        if (ping?.status === "ringing") void checkForRing();
        else if (ping?.status === "ended" && ping.id === currentCallRef.current?.id) void endCall();
      }).subscribe(status => { if (status === "SUBSCRIBED") void checkForRing(); });
    const poll = () => { if (AppState.currentState === "active") void checkForRing(); };
    const interval = setInterval(poll, 60_000);
    const app = AppState.addEventListener("change", state => { if (state === "active") poll(); });
    poll();
    return () => { clearInterval(interval); app.remove(); void supabase.removeChannel(channel); };
  }, [userAddress, checkForRing, endCall]);
  useEffect(() => {
    publishCall(null);
    joiningRef.current = false;
    startedAtRef.current = null;
    setCallStartedAt(null); setRemoteUid(null); setIsCallActive(false);
    setIsIncoming(false); setIsConnecting(false); setMinimized(false);
    setIsMuted(false); setIsSpeakerOn(false); setIsCameraOff(true);
    return () => {
    generationRef.current += 1;
    clearTimeouts();
    const call = currentCallRef.current;
    currentCallRef.current = null;
    disposeMedia(mediaRef.current);
    mediaRef.current = null;
    visualActivity.setCall(false, false);
    void markEnded(call);
    };
  }, [userAddress, clearTimeouts, disposeMedia, markEnded, publishCall]);

  const startCall = useCallback(async (recipientAddress: string, callType: "audio" | "video" = "audio") => {
    if (!userAddress || currentCallRef.current) return;
    const generation = ++generationRef.current;
    const pending: CallSession = {
      id: "pending", caller_address: userAddress, recipient_address: recipientAddress.toLowerCase(),
      status: "ringing", call_type: callType, created_at: new Date().toISOString(),
    };
    publishCall(pending);
    setIsConnecting(true); setMinimized(false);
    visualActivity.setCall(true, true);
    revokeAllFeedVideo(); revokeAudioFocus();
    try {
      const { data, error } = await supabase.from("call_sessions").insert({
        caller_address: pending.caller_address, recipient_address: pending.recipient_address,
        status: "ringing", call_type: callType,
      }).select().single();
      if (error || !data) throw error ?? new Error("Could not initiate call");
      const call = data as CallSession;
      if (generationRef.current !== generation) { await markEnded(call); return; }
      publishCall(call);
      void apiClient.post("/push/call-ring", { sessionId: call.id }, { isAuthRequired: true })
        .catch(error => log.warn("Call ring push failed", error));
      callMessageHandlerRef.current?.(callType === "video" ? "📹 Video call" : "📞 Voice call");
      const joined = await joinChannel(call, generation);
      if (generationRef.current !== generation) return;
      if (!joined) { await endCall(); return; }
      if (startedAtRef.current == null) {
        callTimeoutRef.current = setTimeout(() => {
          if (generationRef.current !== generation || startedAtRef.current != null) return;
          callMessageHandlerRef.current?.(callType === "video" ? "📵 Missed video call" : "📵 Missed voice call");
          void endCall();
        }, 30_000);
      }
    } catch (error) {
      if (generationRef.current === generation) { log.error("Call start failed", error); await endCall(); }
    }
  }, [userAddress, publishCall, markEnded, joinChannel, endCall]);

  const acceptCall = useCallback(async () => {
    const call = currentCallRef.current;
    if (!call || joiningRef.current || call.status !== "ringing") return;
    const generation = generationRef.current;
    joiningRef.current = true;
    clearTimeouts();
    setIsIncoming(false); setIsConnecting(true);
    try {
      const { error } = await supabase.from("call_sessions").update({ status: "connected" }).eq("id", call.id);
      if (generationRef.current !== generation) { await markEnded(call); return; }
      if (error) throw error;
      publishCall({ ...call, status: "connected" });
      const joined = await joinChannel(call, generation);
      if (generationRef.current === generation && !joined) await endCall();
    } catch (error) {
      if (generationRef.current === generation) { log.error("Call accept failed", error); await endCall(); }
    } finally { if (generationRef.current === generation) joiningRef.current = false; }
  }, [clearTimeouts, publishCall, joinChannel, endCall, markEnded]);

  const toggleMute = useCallback(() => {
    const engine = mediaRef.current?.engine;
    if (engine) setIsMuted(previous => { engine.muteLocalAudioStream(!previous); return !previous; });
  }, []);
  const toggleSpeaker = useCallback(() => {
    const engine = mediaRef.current?.engine;
    if (engine) setIsSpeakerOn(previous => { engine.setEnableSpeakerphone(!previous); return !previous; });
  }, []);
  const toggleCamera = useCallback(() => {
    const engine = mediaRef.current?.engine;
    if (!engine) return;
    setIsCameraOff(previous => {
      if (previous) { engine.enableVideo(); engine.enableLocalVideo(true); engine.startPreview(); engine.muteLocalVideoStream(false); }
      else { engine.muteLocalVideoStream(true); engine.stopPreview(); }
      return !previous;
    });
  }, []);
  const switchCamera = useCallback(() => { mediaRef.current?.engine.switchCamera(); }, []);
  const peerAddress = currentCall
    ? currentCall.caller_address === userAddress ? currentCall.recipient_address : currentCall.caller_address : "";
  const remoteCanvas = useMemo<VideoCanvas>(() => ({
    uid: remoteUid ?? 0, sourceType: VideoSourceType.VideoSourceRemote, renderMode: RenderModeType.RenderModeFit,
  }), [remoteUid]);
  return useMemo(() => ({
    isCallActive, isIncoming, currentCall, isConnecting, isMuted, isSpeakerOn, isCameraOff,
    callStartedAt, remoteUid, peerAddress, localCanvas: LOCAL_CANVAS, remoteCanvas,
    startCall, endCall, acceptCall, rejectCall: endCall, toggleMute, toggleSpeaker, toggleCamera,
    switchCamera, setCallMessageHandler, isMinimized, setMinimized,
  }), [isCallActive, isIncoming, currentCall, isConnecting, isMuted, isSpeakerOn, isCameraOff,
    callStartedAt, remoteUid, peerAddress, remoteCanvas, startCall, endCall, acceptCall,
    toggleMute, toggleSpeaker, toggleCamera, switchCamera, setCallMessageHandler, isMinimized]);
}
