import { useState, useRef, useCallback, useEffect } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import createAgoraRtcEngine, {
  type IRtcEngine,
  type IRtcEngineEventHandler,
  type RtcConnection,
  ChannelProfileType,
  ClientRoleType,
  UserOfflineReasonType,
  type ChannelMediaOptions,
  AudioEffectPreset,
} from "react-native-agora";
import { supabase, fetchAgoraToken } from "../services/supabase";
import { AGORA_APP_ID } from "../config/agora.config";
import { useAuth } from "../context/AuthContext";
import { createLogger } from "../libs/logger";
import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";

const log = createLogger("useStages");

export interface AudioSpace {
  id: string;
  host_wallet_address: string;
  host_username?: string | null;
  host_avatar?: string | null;
  title: string;
  description?: string | null;
  status: "live" | "ended";
  channel_name: string;
  listener_count: number;
  speaker_count: number;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
  recording_url?: string | null;
}

export type SpaceRole = "host" | "speaker" | "listener";

export interface SpaceParticipant {
  id: string;
  space_id: string;
  wallet_address: string;
  username?: string | null;
  avatar?: string | null;
  role: SpaceRole;
  is_muted: boolean;
  hand_raised: boolean;
  joined_at: string;
  left_at?: string | null;
}

export interface RaiseHandRequest {
  id: string;
  space_id: string;
  wallet_address: string;
  username?: string | null;
  avatar?: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  resolved_at?: string | null;
}

export interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

export interface TtsVoice {
  voice_id: string;
  name: string;
  labels: Record<string, string>;
  preview_url?: string | null;
}

export const VOICE_EFFECTS = [
  { id: "none",     emoji: "🎙️", name: "Normal"   },
  { id: "deep",     emoji: "🔊", name: "Deep"      },
  { id: "chipmunk", emoji: "🐿️", name: "Chipmunk"  },
  { id: "robot",    emoji: "🤖", name: "Robot"     },
  { id: "echo",     emoji: "🏔️", name: "Echo"      },
  { id: "radio",    emoji: "📻", name: "Radio"     },
] as const;

export interface Segment {
  speaker: string;
  text: string;
  start: number;
  end: number;
}

export interface Chapter {
  title: string;
  start: number;
  end: number;
}

export interface SpeakerMapEntry {
  type: "ai" | "user" | "unknown";
  label?: string;
  source?: string;
  wallet?: string;
}

export interface SpeakerOverride {
  username?: string;
  wallet?: string;
}

export interface StageTranscript {
  id: string;
  stage_id: string;
  status: "pending" | "processing" | "ready" | "failed";
  source_language: string | null;
  full_text: string | null;
  segments: Segment[];
  speaker_map: Record<string, SpeakerMapEntry> | null;
  speaker_overrides: Record<string, SpeakerOverride> | null;
  summary: string | null;
  chapters: Chapter[] | null;
  summary_status: "pending" | "processing" | "ready" | "failed";
  privacy: "public" | "members" | "private";
  error: string | null;
  created_at: string;
}


export interface UseStagesReturn {
  liveSpaces: AudioSpace[];
  pastSpaces: AudioSpace[];
  currentSpace: AudioSpace | null;
  participants: SpaceParticipant[];
  handRequests: RaiseHandRequest[];
  isLoading: boolean;
  isConnected: boolean;
  isMuted: boolean;
  myRole: SpaceRole | null;
  hasRaisedHand: boolean;
  isModalOpen: boolean;
  initialModalView: "browse" | "create" | "live";
  floatingReactions: FloatingReaction[];
  voiceEffect: string;
  ttsVoices: TtsVoice[];
  isTtsVoicesLoading: boolean;
  isTtsGenerating: boolean;
  isRecording: boolean;
  activeSpeakerUids: number[];
  transcript: StageTranscript | null;
  isTranscriptLoading: boolean;
  openModal: (view?: "browse" | "create" | "live") => void;
  closeModal: () => void;
  createSpace: (title: string, description?: string) => Promise<AudioSpace | null>;
  joinSpace: (spaceId: string) => Promise<boolean>;
  leaveSpace: () => Promise<void>;
  endSpace: () => Promise<void>;
  toggleMute: () => void;
  raiseHand: () => Promise<void>;
  lowerHand: () => Promise<void>;
  approveSpeaker: (walletAddress: string) => Promise<void>;
  removeSpeaker: (walletAddress: string) => Promise<void>;
  inviteSpeaker: (walletAddress: string) => Promise<void>;
  sendReaction: (emoji: string) => void;
  dismissFloatingReaction: (id: number) => void;
  applyVoiceEffect: (effectId: string) => void;
  fetchTtsVoices: () => Promise<void>;
  generateTts: (text: string, voiceId: string) => Promise<void>;
  fetchTranscript: (spaceId: string) => Promise<void>;
  refreshSpaces: () => Promise<void>;
}

let stageEngineInstance: IRtcEngine | null = null;
let stageEngineInit = false;

function getStageEngine(): IRtcEngine {
  if (!stageEngineInstance) {
    stageEngineInstance = createAgoraRtcEngine();
  }
  return stageEngineInstance;
}

export function useStages(): UseStagesReturn {
  const [liveSpaces, setLiveSpaces] = useState<AudioSpace[]>([]);
  const [pastSpaces, setPastSpaces] = useState<AudioSpace[]>([]);
  const [currentSpace, setCurrentSpace] = useState<AudioSpace | null>(null);
  const [participants, setParticipants] = useState<SpaceParticipant[]>([]);
  const [handRequests, setHandRequests] = useState<RaiseHandRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [myRole, setMyRole] = useState<SpaceRole | null>(null);
  const [hasRaisedHand, setHasRaisedHand] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [voiceEffect, setVoiceEffect] = useState("none");
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [isTtsVoicesLoading, setIsTtsVoicesLoading] = useState(false);
  const [isTtsGenerating, setIsTtsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeakerUids, setActiveSpeakerUids] = useState<number[]>([]);
  const [transcript, setTranscript] = useState<StageTranscript | null>(null);
  const [isTranscriptLoading, setIsTranscriptLoading] = useState(false);

  const recordingPathRef = useRef<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialModalView, setInitialModalView] = useState<"browse" | "create" | "live">("browse");

  const { user } = useAuth();
  const userAddress = user?.walletAddress || user?.address || "";

  const currentSpaceRef = useRef<AudioSpace | null>(null);
  useEffect(() => { currentSpaceRef.current = currentSpace; }, [currentSpace]);

  const myRoleRef = useRef<SpaceRole | null>(null);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

  const userAddressRef = useRef<string>("");
  useEffect(() => { userAddressRef.current = userAddress; }, [userAddress]);

  const reactionCounterRef = useRef(0);
  const lastReactionTimeRef = useRef(0);
  const reactionsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // ── Modal ─────────────────────────────────────────────────────────────────

  const openModal = useCallback((view: "browse" | "create" | "live" = "browse") => {
    setInitialModalView(view);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => setIsModalOpen(false), []);

  // ── Fetch live spaces ─────────────────────────────────────────────────────

  const refreshSpaces = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("status", "live")
        .order("started_at", { ascending: false });
      if (error) throw error;
      setLiveSpaces((data as AudioSpace[]) || []);

      const { data: endedData, error: endedError } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("status", "ended")
        .order("ended_at", { ascending: false })
        .limit(20);
      if (endedError) throw endedError;
      setPastSpaces((endedData as AudioSpace[]) || []);
    } catch (err) {
      log.error("Error fetching stages:", err);
    }
  }, []);

  // ── Agora init ────────────────────────────────────────────────────────────

  const initStageEngine = useCallback(async (): Promise<IRtcEngine> => {
    const engine = getStageEngine();
    if (!stageEngineInit) {
      if (!AGORA_APP_ID) throw new Error("AGORA_APP_ID is not configured");
      engine.registerEventHandler(stageEventHandlerRef.current);
      await engine.initialize({ appId: AGORA_APP_ID });
      stageEngineInit = true;
      log.info("Stage Agora engine initialized");
    }
    return engine;
  }, []);

  // ── Event handler ─────────────────────────────────────────────────────────

  const stageEventHandlerRef = useRef<IRtcEngineEventHandler>({
    onUserJoined: (_connection: RtcConnection, remoteUid: number, _elapsed: number) => {
      log.info("Stage user joined:", remoteUid);
    },
    onUserOffline: (_connection: RtcConnection, remoteUid: number, _reason: UserOfflineReasonType) => {
      log.info("Stage user left:", remoteUid);
      setActiveSpeakerUids(prev => prev.filter(u => u !== remoteUid));
    },
    onAudioVolumeIndication: (_connection: RtcConnection, speakers: any[], _speakerCount: number, _totalVolume: number) => {
      const active = speakers
        .filter((s: any) => (s.volume || 0) > 10)
        .map((s: any) => s.uid as number);
      setActiveSpeakerUids(active);
    },
  });

  // ── Join / leave stage channel ─────────────────────────────────────────────

  const joinStageChannel = useCallback(async (space: AudioSpace, role: SpaceRole): Promise<boolean> => {
    const channelName = space.channel_name;
    const agoraRole = role === "listener" ? "subscriber" : "publisher";
    const tokenData = await fetchAgoraToken(channelName, agoraRole);
    if (!tokenData) return false;

    try {
      const engine = await initStageEngine();
      engine.setChannelProfile(ChannelProfileType.ChannelProfileLiveBroadcasting);
      const clientRole = role === "listener" ? ClientRoleType.ClientRoleAudience : ClientRoleType.ClientRoleBroadcaster;
      engine.setClientRole(clientRole);

      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          log.error("RECORD_AUDIO permission denied");
          return false;
        }
      }

      engine.enableAudio();
      // Report audio levels every 500ms so SpeakerCard animations update smoothly
      engine.enableAudioVolumeIndication(500, 3, false);
      if (role !== "listener") {
        // Start muted — host/speaker must press unmute to be heard (matches web UX)
        engine.muteLocalAudioStream(true);
      }
      const options: ChannelMediaOptions = {
        publishMicrophoneTrack: role !== "listener",
        publishCameraTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: false,
      };
      engine.joinChannel(tokenData.token, channelName, tokenData.uid ?? 0, options);
      setIsConnected(true);

      // Host records the mixed channel audio for later transcription
      if (role === "host") {
        const recPath = `${FileSystem.cacheDirectory}stage_${space.id}_${Date.now()}.aac`;
        const rawRecPath = recPath.startsWith("file://")
          ? decodeURIComponent(recPath.substring(7))
          : recPath;
        try {
          const ret = engine.startAudioRecording({
            filePath: rawRecPath,
            encode: true,        // AAC encoding
            // 3 = Mixed (local mic + all remote audio)
            fileRecordingType: 3 as any,
            // 2 = High quality
            quality: 2 as any,
          } as any);
          if (ret < 0) {
            log.error("Stage recording failed to start. Error code:", ret);
          } else {
            recordingPathRef.current = recPath;
            setIsRecording(true);
            log.info("Stage recording started successfully. Path:", rawRecPath);
          }
        } catch (recErr) {
          log.warn("Stage recording failed to start (non-fatal exception):", recErr);
        }
      }

      return true;
    } catch (err) {
      log.error("Failed to join stage channel:", err);
      return false;
    }
  }, [initStageEngine]);

  const leaveStageChannel = useCallback(async () => {
    const engine = getStageEngine();
    let savedRecPath: string | null = null;
    try {
      if (recordingPathRef.current) {
        engine.stopAudioRecording();
        savedRecPath = recordingPathRef.current;
        recordingPathRef.current = null;
        setIsRecording(false);
      }
      engine.setAudioEffectPreset(AudioEffectPreset.AudioEffectOff);
      await engine.leaveChannel();
    } catch (e) {
      log.warn("Stage leave error:", e);
    }
    setIsConnected(false);
    setIsMuted(true);
    setVoiceEffect("none");
    setActiveSpeakerUids([]);
    return savedRecPath;
  }, []);

  // ── Upgrade listener → speaker when host approves ─────────────────────────

  const upgradeSpeakerRef = useRef<() => Promise<void>>(async () => {});

  const upgradeSpeaker = useCallback(async () => {
    const engine = getStageEngine();
    try {
      engine.setClientRole(ClientRoleType.ClientRoleBroadcaster);
      engine.updateChannelMediaOptions({
        publishMicrophoneTrack: true,
        publishCameraTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: false,
      });
      // Start muted — speaker must press unmute button to talk
      engine.muteLocalAudioStream(true);
      setMyRole("speaker");
      setIsMuted(true);
      setHasRaisedHand(false);
      log.info("Upgraded to speaker");
    } catch (err) {
      log.error("Failed to upgrade to speaker:", err);
    }
  }, []);

  useEffect(() => { upgradeSpeakerRef.current = upgradeSpeaker; }, [upgradeSpeaker]);

  // ── Floating reactions ─────────────────────────────────────────────────────

  const spawnFloatingReaction = useCallback((emoji: string) => {
    const id = ++reactionCounterRef.current;
    const x = 8 + Math.random() * 70; // 8–78% so emoji stays on screen
    setFloatingReactions(prev => [...prev, { id, emoji, x }]);
  }, []);

  const dismissFloatingReaction = useCallback((id: number) => {
    setFloatingReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  // ── Voice effects ──────────────────────────────────────────────────────────

  const applyVoiceEffect = useCallback((effectId: string) => {
    if (myRole === "listener") return;
    const engine = getStageEngine();
    let preset = AudioEffectPreset.AudioEffectOff;
    switch (effectId) {
      case "deep":     preset = AudioEffectPreset.VoiceChangerEffectUncle; break;
      case "chipmunk": preset = AudioEffectPreset.VoiceChangerEffectBoy;   break;
      case "robot":    preset = AudioEffectPreset.PitchCorrection;          break;
      case "echo":     preset = AudioEffectPreset.RoomAcousticsKtv;         break;
      case "radio":    preset = AudioEffectPreset.VoiceChangerEffectOldman; break;
    }
    engine.setAudioEffectPreset(preset);
    setVoiceEffect(effectId);
  }, [myRole]);

  // ── TTS ────────────────────────────────────────────────────────────────────

  const fetchTtsVoices = useCallback(async () => {
    if (ttsVoices.length > 0 || isTtsVoicesLoading) return;
    setIsTtsVoicesLoading(true);
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/functions/v1/elevenlabs-voices?page_size=30`,
        {
          headers: {
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
          },
        },
      );
      if (!res.ok) throw new Error("Failed to fetch voices");
      const data = await res.json() as { voices?: TtsVoice[] };
      setTtsVoices(data.voices || []);
    } catch (err) {
      log.error("Failed to fetch TTS voices:", err);
    } finally {
      setIsTtsVoicesLoading(false);
    }
  }, [ttsVoices.length, isTtsVoicesLoading]);

  const generateTts = useCallback(async (text: string, voiceId: string) => {
    if (!text.trim() || !voiceId || isTtsGenerating) return;
    setIsTtsGenerating(true);
    try {
      const response = await fetch(
        `${env.SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: text.trim(), voiceId }),
        },
      );
      if (!response.ok) throw new Error(`TTS failed (${response.status})`);

      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)) as number[]);
      }
      const base64 = btoa(binary);
      const tempPath = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;
      await FileSystem.writeAsStringAsync(tempPath, base64, { encoding: FileSystem.EncodingType.Base64 });

      // Inject into the Agora channel so all participants hear it
      const rawTempPath = tempPath.startsWith("file://")
        ? decodeURIComponent(tempPath.substring(7))
        : tempPath;
      getStageEngine().startAudioMixing(rawTempPath, false, 1);
    } catch (err) {
      log.error("TTS generation failed:", err);
    } finally {
      setIsTtsGenerating(false);
    }
  }, [isTtsGenerating]);

  const sendReaction = useCallback((emoji: string) => {
    const now = Date.now();
    if (now - lastReactionTimeRef.current < 300) return; // 300ms cooldown
    lastReactionTimeRef.current = now;

    // Broadcast to other participants via Supabase
    if (reactionsChannelRef.current) {
      reactionsChannelRef.current.send({
        type: "broadcast",
        event: "reaction",
        payload: { emoji, wallet: userAddress },
      });
    }
    spawnFloatingReaction(emoji);
  }, [spawnFloatingReaction, userAddress]);

  // ── Realtime subscriptions for current space ──────────────────────────────

  useEffect(() => {
    if (!currentSpace) return;
    const spaceId = currentSpace.id;

    // Initial participant fetch (active only — left_at IS NULL)
    supabase.from("space_participants").select("*")
      .eq("space_id", spaceId).is("left_at", null)
      .then(({ data }) => { if (data) setParticipants(data as SpaceParticipant[]); });

    // Initial hand requests fetch (host only)
    if (myRoleRef.current === "host") {
      supabase.from("raise_hand_requests").select("*")
        .eq("space_id", spaceId).eq("status", "pending")
        .then(({ data }) => { if (data) setHandRequests(data as RaiseHandRequest[]); });
    }

    // Participants channel — incremental updates from payload
    const pChan = supabase
      .channel(`space-${spaceId}-participants`)
      .on("postgres_changes", { event: "*", schema: "public", table: "space_participants", filter: `space_id=eq.${spaceId}` },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const p = payload.new as SpaceParticipant;
            if (!p.left_at) {
              setParticipants(prev => prev.some(x => x.id === p.id) ? prev : [...prev, p]);
            }
          } else if (payload.eventType === "UPDATE") {
            const p = payload.new as SpaceParticipant;
            if (p.left_at) {
              setParticipants(prev => prev.filter(x => x.id !== p.id));
            } else {
              setParticipants(prev => prev.map(x => x.id === p.id ? p : x));
              // If current user was just approved as speaker — upgrade Agora role
              if (p.wallet_address === userAddressRef.current && p.role === "speaker" && myRoleRef.current === "listener") {
                upgradeSpeakerRef.current();
              }
            }
          } else if (payload.eventType === "DELETE") {
            const p = payload.old as SpaceParticipant;
            setParticipants(prev => prev.filter(x => x.id !== p.id));
          }
        })
      .subscribe();

    // Hand requests channel — incremental updates
    const hChan = supabase
      .channel(`space-${spaceId}-hands`)
      .on("postgres_changes", { event: "*", schema: "public", table: "raise_hand_requests", filter: `space_id=eq.${spaceId}` },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const r = payload.new as RaiseHandRequest;
            if (r.status === "pending") {
              setHandRequests(prev => prev.some(x => x.id === r.id) ? prev : [...prev, r]);
            }
          } else if (payload.eventType === "UPDATE") {
            const r = payload.new as RaiseHandRequest;
            if (r.status !== "pending") {
              setHandRequests(prev => prev.filter(x => x.id !== r.id));
              if (r.wallet_address === userAddressRef.current) setHasRaisedHand(false);
            }
          } else if (payload.eventType === "DELETE") {
            const r = payload.old as RaiseHandRequest;
            setHandRequests(prev => prev.filter(x => x.id !== r.id));
          }
        })
      .subscribe();

    // Stage status channel — detect when host ends the stage
    const sChan = supabase
      .channel(`space-${spaceId}-status`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "audio_spaces", filter: `id=eq.${spaceId}` },
        async (payload: any) => {
          const updated = payload.new as AudioSpace;
          if (updated.status === "ended") {
            await leaveStageChannel();
            setCurrentSpace(null);
            setMyRole(null);
            setParticipants([]);
            setHandRequests([]);
            setHasRaisedHand(false);
            closeModal();
          } else {
            setCurrentSpace(updated);
          }
        })
      .subscribe();

    // Reactions broadcast channel
    const reactChan = supabase
      .channel(`stage-reactions:${spaceId}`)
      .on("broadcast", { event: "reaction" }, (payload: any) => {
        const emoji = payload?.payload?.emoji;
        if (emoji) spawnFloatingReaction(emoji);
      })
      .subscribe();
    reactionsChannelRef.current = reactChan;

    return () => {
      supabase.removeChannel(pChan);
      supabase.removeChannel(hChan);
      supabase.removeChannel(sChan);
      supabase.removeChannel(reactChan);
      reactionsChannelRef.current = null;
    };
  }, [currentSpace?.id, leaveStageChannel, closeModal, spawnFloatingReaction]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const createSpace = useCallback(async (title: string, description?: string): Promise<AudioSpace | null> => {
    if (!userAddress) return null;
    setIsLoading(true);
    try {
      const channelName = `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await supabase
        .from("audio_spaces")
        .insert({
          host_wallet_address: userAddress,
          host_username: user?.username || null,
          host_avatar: user?.avatarImageUrl || null,
          title,
          description,
          status: "live",
          channel_name: channelName,
          speaker_count: 1,
          listener_count: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      const space = data as AudioSpace;

      // Add host as participant so they appear in the speakers list
      await supabase.from("space_participants").insert({
        space_id: space.id,
        wallet_address: userAddress,
        username: user?.username || null,
        avatar: user?.avatarImageUrl || null,
        role: "host",
        is_muted: true,
      });

      const success = await joinStageChannel(space, "host");
      if (!success) {
        await supabase.from("audio_spaces").update({ status: "ended" }).eq("id", space.id);
        throw new Error("Failed to join Agora channel");
      }

      setCurrentSpace(space);
      setMyRole("host");
      setIsMuted(true);
      await refreshSpaces();
      return space;
    } catch (err) {
      log.error("Failed to create space:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, user, joinStageChannel, refreshSpaces]);

  const joinSpace = useCallback(async (spaceId: string): Promise<boolean> => {
    if (!userAddress) return false;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("id", spaceId)
        .single();
      if (error || !data) throw error || new Error("Space not found");
      const space = data as AudioSpace;
      if (space.status !== "live") return false;

      // Register as listener participant (upsert handles re-join)
      await supabase.from("space_participants").upsert({
        space_id: spaceId,
        wallet_address: userAddress,
        username: user?.username || null,
        avatar: user?.avatarImageUrl || null,
        role: "listener",
        is_muted: true,
        left_at: null,
      }, { onConflict: "space_id,wallet_address" });

      // Increment listener count
      await supabase.from("audio_spaces")
        .update({ listener_count: (space.listener_count || 0) + 1 })
        .eq("id", spaceId);

      const success = await joinStageChannel(space, "listener");
      if (!success) return false;

      setCurrentSpace(space);
      setMyRole("listener");
      setHasRaisedHand(false);
      return true;
    } catch (err) {
      log.error("Failed to join space:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, user, joinStageChannel]);

  const leaveSpace = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (space && userAddress) {
      // Soft delete — preserve history by setting left_at
      await supabase.from("space_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("space_id", space.id)
        .eq("wallet_address", userAddress);

      if (myRoleRef.current === "listener") {
        await supabase.from("audio_spaces")
          .update({ listener_count: Math.max(0, (space.listener_count || 1) - 1) })
          .eq("id", space.id);
      }
    }
    await leaveStageChannel();
    setCurrentSpace(null);
    setMyRole(null);
    setParticipants([]);
    setHandRequests([]);
    setHasRaisedHand(false);
    setFloatingReactions([]);
    closeModal();
    await refreshSpaces();
  }, [userAddress, leaveStageChannel, closeModal, refreshSpaces]);

  // ── Recording upload + transcription ──────────────────────────────────────

  const uploadAndTranscribe = useCallback(async (recPath: string, spaceId: string) => {
    try {
      log.info("Uploading stage recording:", recPath);

      // Wait up to 3 seconds for the Agora SDK to finish writing the file to disk
      let fileInfo = await FileSystem.getInfoAsync(recPath);
      let attempts = 0;
      while ((!fileInfo.exists || fileInfo.size === 0) && attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        fileInfo = await FileSystem.getInfoAsync(recPath);
        attempts++;
      }

      log.info("Recording file info before upload:", fileInfo);
      if (!fileInfo.exists) {
        log.error("Recording file does not exist at path:", recPath);
        return;
      }
      if (fileInfo.size === 0) {
        log.error("Recording file size is 0 bytes. Skipping upload.");
        await FileSystem.deleteAsync(recPath, { idempotent: true });
        return;
      }

      const result = await FileSystem.uploadAsync(
        `${env.SUPABASE_URL}/storage/v1/object/stage-recordings/${spaceId}/recording.mp4`,
        recPath,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "audio/mp4",
            "x-upsert": "true",
          },
        },
      );

      log.info(`Upload response status: ${result.status}`);
      if (result.status >= 200 && result.status < 300) {
        // Update recording_url in audio_spaces
        const recordingUrl = `${env.SUPABASE_URL}/storage/v1/object/public/stage-recordings/${spaceId}/recording.mp4`;
        const { error: updateErr } = await supabase
          .from("audio_spaces")
          .update({ recording_url: recordingUrl })
          .eq("id", spaceId);
        if (updateErr) {
          log.error("Failed to update space recording_url in database:", updateErr);
        } else {
          log.info("Successfully updated recording_url in database");
        }

        // Trigger transcription
        try {
          await supabase.functions.invoke("transcribe-stage", { body: { stageId: spaceId, timeline: [] } });
          log.info("Transcription triggered for stage:", spaceId);
        } catch (transcribeErr) {
          log.error("Failed to trigger stage transcription:", transcribeErr);
        }
      } else {
        log.error(`Recording upload to Supabase storage failed with status ${result.status}. Response: ${result.body}`);
      }

      // Clean up local file regardless
      await FileSystem.deleteAsync(recPath, { idempotent: true });
    } catch (err) {
      log.error("Recording upload failed (non-fatal):", err);
    }
  }, []);

  const endSpace = useCallback(async () => {
    const space = currentSpaceRef.current;
    const spaceId = space?.id;
    // Capture recording path before leaveSpace() nulls it out
    const recPath = recordingPathRef.current;
    if (space && myRoleRef.current === "host") {
      await supabase.from("audio_spaces")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", space.id);
    }
    await leaveSpace();
    // Upload recording in background after leaving (non-blocking)
    if (recPath && spaceId) {
      uploadAndTranscribe(recPath, spaceId);
    }
  }, [leaveSpace, uploadAndTranscribe]);

  const toggleMute = useCallback(() => {
    if (myRole === "listener") return;
    const next = !isMuted;
    getStageEngine().muteLocalAudioStream(next);
    setIsMuted(next);
    const space = currentSpaceRef.current;
    if (space && userAddress) {
      supabase.from("space_participants")
        .update({ is_muted: next })
        .eq("space_id", space.id)
        .eq("wallet_address", userAddress);
    }
  }, [isMuted, myRole, userAddress]);

  const raiseHand = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (!space || !userAddress || myRole !== "listener" || hasRaisedHand) return;
    await supabase.from("raise_hand_requests").insert({
      space_id: space.id,
      wallet_address: userAddress,
      username: user?.username || null,
      avatar: user?.avatarImageUrl || null,
      status: "pending",
    });
    setHasRaisedHand(true);
  }, [userAddress, user, myRole, hasRaisedHand]);

  const lowerHand = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (!space || !userAddress) return;
    await supabase.from("raise_hand_requests")
      .update({ status: "rejected", resolved_at: new Date().toISOString() })
      .eq("space_id", space.id)
      .eq("wallet_address", userAddress)
      .eq("status", "pending");
    setHasRaisedHand(false);
  }, [userAddress]);

  const approveSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await supabase.from("raise_hand_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("space_id", space.id)
      .eq("wallet_address", walletAddress)
      .eq("status", "pending");

    await supabase.from("space_participants")
      .update({ role: "speaker", is_muted: true })
      .eq("space_id", space.id)
      .eq("wallet_address", walletAddress);

    await supabase.from("audio_spaces")
      .update({
        speaker_count: (space.speaker_count || 1) + 1,
        listener_count: Math.max(0, (space.listener_count || 1) - 1),
      })
      .eq("id", space.id);
  }, []);

  const removeSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await supabase.from("space_participants")
      .update({ role: "listener", is_muted: true })
      .eq("space_id", space.id)
      .eq("wallet_address", walletAddress);

    await supabase.from("audio_spaces")
      .update({
        speaker_count: Math.max(1, (space.speaker_count || 2) - 1),
        listener_count: (space.listener_count || 0) + 1,
      })
      .eq("id", space.id);
  }, []);

  const inviteSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await supabase.from("space_participants")
      .update({ role: "speaker", is_muted: true })
      .eq("space_id", space.id)
      .eq("wallet_address", walletAddress);

    await supabase.from("audio_spaces")
      .update({
        speaker_count: (space.speaker_count || 1) + 1,
        listener_count: Math.max(0, (space.listener_count || 1) - 1),
      })
      .eq("id", space.id);
  }, []);



  // ── Transcript fetch ───────────────────────────────────────────────────────

  const fetchTranscript = useCallback(async (spaceId: string) => {
    setIsTranscriptLoading(true);
    try {
      const { data, error } = await supabase
        .from("stage_transcripts")
        .select("*")
        .eq("stage_id", spaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      setTranscript(data as StageTranscript | null);
    } catch (err) {
      log.error("Failed to fetch transcript:", err);
    } finally {
      setIsTranscriptLoading(false);
    }
  }, []);

  // ── Initial fetch + live spaces realtime ──────────────────────────────────

  useEffect(() => {
    refreshSpaces();

    const listChan = supabase
      .channel("live-spaces-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "audio_spaces" }, () => {
        refreshSpaces();
      })
      .subscribe();

    return () => { supabase.removeChannel(listChan); };
  }, [refreshSpaces]);

  return {
    liveSpaces,
    pastSpaces,
    currentSpace,
    participants,
    handRequests,
    isLoading,
    isConnected,
    isMuted,
    myRole,
    hasRaisedHand,
    isModalOpen,
    initialModalView,
    floatingReactions,
    voiceEffect,
    ttsVoices,
    isTtsVoicesLoading,
    isTtsGenerating,
    isRecording,
    activeSpeakerUids,
    transcript,
    isTranscriptLoading,
    openModal,
    closeModal,
    createSpace,
    joinSpace,
    leaveSpace,
    endSpace,
    toggleMute,
    raiseHand,
    lowerHand,
    approveSpeaker,
    removeSpeaker,
    sendReaction,
    dismissFloatingReaction,
    applyVoiceEffect,
    fetchTtsVoices,
    generateTts,
    inviteSpeaker,
    fetchTranscript,
    refreshSpaces,
  };
}
