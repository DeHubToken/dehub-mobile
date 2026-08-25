import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
  RemoteVideoState,
  type RemoteVideoStateReason,
  VideoStreamType,
} from "react-native-agora";
import { supabase, fetchAgoraToken } from "../services/supabase";
import { AGORA_APP_ID } from "../config/agora.config";
import { useAuth } from "../context/AuthContext";
import { createLogger } from "../libs/logger";
import { persistableAvatar } from "../libs/misc";
import env from "../config/env";
import { getAuthToken } from "../libs/auth.utils";
import { withWalletHeader } from "../libs/supabase-wallet-client";

const log = createLogger("useStages");

/**
 * Stage recordings are AAC in an ADTS elementary stream — the only compressed
 * shape Agora's recorder can write (`encode: true`; the alternative is raw
 * WAV, which for a half-hour stage is ~100 MB off a phone). It is not an MP4,
 * so the extension and the Content-Type both have to say AAC. Three consumers
 * read them and none of them should have to sniff: `finalize-stage-recording`
 * remuxes the stream into a seekable MP4 and hands it on to the speech
 * service, dehubweb plays the object URL in a plain `<audio>`, and
 * `libs/stage-playback` feeds it to ExoPlayer.
 */
const RECORDING_EXT = "aac";
const RECORDING_MIME = "audio/aac";
const RECORDING_OBJECT = `recording.${RECORDING_EXT}`;

export interface AudioSpace {
  id: string;
  host_wallet_address: string;
  host_username?: string | null;
  host_avatar?: string | null;
  title: string;
  description?: string | null;
  /**
   * `scheduled` is a stage announced ahead of time — the row exists and is
   * shareable, but no Agora channel has been opened. It becomes `live` when
   * the host starts it.
   */
  status: "scheduled" | "live" | "ended";
  channel_name: string;
  listener_count: number;
  speaker_count: number;
  started_at: string;
  ended_at?: string | null;
  created_at: string;
  recording_url?: string | null;
  /** Intended start time — set only on `scheduled` stages. */
  scheduled_at?: string | null;
  /** Optional cover graphic, backing the announcement card and the live room. */
  cover_image_url?: string | null;
  /**
   * Short share id backing dehub.io/stages/:n. Nullable because a row created
   * before the column existed never got one, and those still share by uuid.
   */
  short_id?: number | null;
}

/** What the schedule form collects. */
export interface ScheduleSpaceInput {
  title: string;
  description?: string;
  /** ISO timestamp for the intended start. */
  scheduledAt: string;
  /** Public URL of an already-uploaded cover graphic. */
  coverImageUrl?: string | null;
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
  /** 'empty' is a finished run that found no speech — its own state so it can
   *  be retried and does not render as a working transcript with nothing in it. */
  status: "pending" | "processing" | "ready" | "empty" | "failed";
  source_language: string | null;
  full_text: string | null;
  segments: Segment[];
  speaker_map: Record<string, SpeakerMapEntry> | null;
  speaker_overrides: Record<string, SpeakerOverride> | null;
  summary: string | null;
  chapters: Chapter[] | null;
  summary_status: "pending" | "processing" | "ready" | "skipped" | "failed";
  privacy: "public" | "members" | "private";
  /** How many transcription runs this row has spent. Past five, asking again
   *  produces nothing but a spinner. */
  attempts?: number;
  error: string | null;
  created_at: string;
}


export interface UseStagesReturn {
  liveSpaces: AudioSpace[];
  pastSpaces: AudioSpace[];
  scheduledSpaces: AudioSpace[];
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
  /**
   * Agora uid of whoever is sharing a screen into this stage, or null. A web
   * host publishes it; this app only ever watches — see joinStageChannel.
   */
  screenShareUid: number | null;
  transcript: StageTranscript | null;
  isTranscriptLoading: boolean;
  openModal: (view?: "browse" | "create" | "live") => void;
  closeModal: () => void;
  createSpace: (title: string, description?: string) => Promise<AudioSpace | null>;
  scheduleSpace: (input: ScheduleSpaceInput) => Promise<AudioSpace | null>;
  startScheduledSpace: (spaceId: string) => Promise<boolean>;
  cancelScheduledSpace: (spaceId: string) => Promise<boolean>;
  /** Host-only: delete an ended stage's row and its recording file, if any. */
  deleteEndedSpace: (space: AudioSpace) => Promise<boolean>;
  joinSpace: (spaceId: string) => Promise<boolean>;
  /**
   * Listen to a live stage without an account — matches dehubweb's
   * `guestListen()`. Subscriber-only Agora token (the edge function accepts
   * one with no auth), no `space_participants` row, no headcount bump.
   * `myRole` stays null so every speak/raise-hand control (gated on
   * "host"/"speaker"/"listener") stays hidden for a guest automatically.
   */
  guestListenSpace: (spaceId: string) => Promise<boolean>;
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
  /** Pad currently playing through the channel, or null. */
  playingSoundId: string | null;
  /**
   * Play a soundboard clip into the Agora channel so everyone hears it, the
   * same route TTS takes. `id` is only an identity for the pressed-pad state.
   */
  playSoundEffect: (url: string, id: string) => Promise<void>;
  stopSoundEffect: () => void;
  fetchTranscript: (spaceId: string) => Promise<void>;
  refreshSpaces: () => Promise<void>;
}

/**
 * How long a scheduled stage stays on the upcoming shelf after its start time
 * passes. Hosts run late, and a stage vanishing from the list at the exact
 * minute it was due — while people are still arriving from the link — reads as
 * the feature being broken. Kept in step with dehubweb's StageContext.
 */
const SCHEDULED_GRACE_MS = 2 * 60 * 60 * 1000;

/**
 * Wallet equality, the way the rest of the stack does it — every RLS policy on
 * a stage table compares `lower(...)`, and so does dehubweb.
 */
export function sameWallet(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Recount a room's headcounts from the participant rows themselves.
 *
 * This used to be a blind `listener_count + 1` on join and `- 1` on leave,
 * which drifts on every rejoin (the upsert collides, so no row is added but
 * the counter still moved) and on every crash-out (the decrement never runs).
 * Speakers were never counted at all, so promoting someone left the figure
 * stale until the next full refresh. dehubweb recounts on both edges for
 * exactly this reason; a count derived from the rows is self-healing, and both
 * clients now converge on the same number instead of fighting over it.
 */
async function recountSpace(spaceId: string): Promise<void> {
  try {
    // Through the RPC rather than counting and writing from here. Once
    // audio_spaces UPDATE is host-only, a listener writing these columns
    // directly is refused — and a listener arriving or leaving is exactly when
    // the count has to move. recount_space() is SECURITY DEFINER and derives
    // both figures server-side, so it hands out no privilege beyond these two
    // columns and there is no caller-supplied number to be wrong about.
    const { error } = await supabase.rpc("recount_space", { p_space_id: spaceId });
    if (!error) return;

    // The RPC does not exist until the staged migration is applied, and the
    // error comes back in the result object — shipping a build that depends on
    // it ahead of the DB would freeze every headcount this client touches,
    // exactly the regression web shipped and then hotfixed. Until the function
    // exists, recount inline the way this code did before the RPC; once the
    // migration lands, the RPC answers first and this path never runs again.
    const { count: listeners } = await supabase
      .from("space_participants")
      .select("*", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .eq("role", "listener")
      .is("left_at", null);

    const { count: speakers } = await supabase
      .from("space_participants")
      .select("*", { count: "exact", head: true })
      .eq("space_id", spaceId)
      .in("role", ["host", "speaker"])
      .is("left_at", null);

    await supabase
      .from("audio_spaces")
      .update({ listener_count: listeners ?? 0, speaker_count: speakers ?? 1 })
      .eq("id", spaceId);
  } catch (err) {
    // A headcount is not worth failing a join or a leave over.
    log.error("Failed to recount stage participants:", err);
  }
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
  const [scheduledSpaces, setScheduledSpaces] = useState<AudioSpace[]>([]);
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
  const [playingSoundId, setPlayingSoundId] = useState<string | null>(null);
  const [ttsVoices, setTtsVoices] = useState<TtsVoice[]>([]);
  const [isTtsVoicesLoading, setIsTtsVoicesLoading] = useState(false);
  const [isTtsGenerating, setIsTtsGenerating] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeakerUids, setActiveSpeakerUids] = useState<number[]>([]);
  const [screenShareUid, setScreenShareUid] = useState<number | null>(null);
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

  /**
   * Every stage WRITE goes through this.
   *
   * The stage tables' write policies check `get_request_wallet_address()`,
   * which reads the `x-wallet-address` request header, and the plain supabase
   * client never sends it. Reads are `USING (true)` and need nothing; a write
   * that skips this is refused once the policies are tightened — and refused
   * SILENTLY, because a policy failure on an un-inspected update returns no
   * rows rather than throwing.
   *
   * Deliberately reads `userAddress` rather than the ref: this is only ever
   * called from inside a callback that already has the address in scope, and a
   * stale ref would sign a write for the previous account.
   */
  const signed = useCallback(
    <T,>(query: T): T => withWalletHeader(query as never, userAddress) as T,
    [userAddress],
  );

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

      // Upcoming, soonest first. Stages whose time came and went without the
      // host starting them drop off the shelf after a grace period rather than
      // being deleted — the row stays reachable by link so a shared card still
      // resolves, it just stops sitting in the upcoming list forever.
      const cutoff = new Date(Date.now() - SCHEDULED_GRACE_MS).toISOString();
      const { data: scheduledData, error: scheduledError } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("status", "scheduled")
        .gte("scheduled_at", cutoff)
        .order("scheduled_at", { ascending: true });
      if (scheduledError) throw scheduledError;
      setScheduledSpaces((scheduledData as AudioSpace[]) || []);
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

      // ── Watch a shared screen, never send one ────────────────────────────
      //
      // A web host can put their display on a stage; this app has no way to
      // publish one — that needs a ReplayKit broadcast extension on iOS and a
      // MediaProjection service on Android, both native build work — so the
      // video module is turned on strictly to receive.
      //
      // `enableLocalVideo(false)` and `muteLocalVideoStream(true)` are the
      // load-bearing half of that. `enableVideo()` alone starts camera
      // capture, which in an audio room means a camera indicator lighting up
      // on a stage where nobody is on video, and on iOS a camera permission
      // prompt nobody asked for.
      //
      // Set here, once, rather than per join: `enableVideo()` resets the
      // engine (and, called from inside a channel, resets `enableLocalVideo`
      // and the remote-mute flags), while these settings survive
      // `leaveChannel` — so doing it at init keeps the reset off the path
      // every single stage join walks.
      //
      // Phones take the small copy of the screen the web host publishes
      // alongside the full one. A handset renders it a few hundred pixels
      // wide, and on cellular the 1080p stream is the difference between a
      // stage that plays and one that stutters.
      engine.enableVideo();
      engine.enableLocalVideo(false);
      engine.muteLocalVideoStream(true);
      engine.setRemoteDefaultVideoStreamType(VideoStreamType.VideoStreamLow);

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
      // A sharer who force-quits never gets to stop their video cleanly.
      setScreenShareUid(prev => (prev === remoteUid ? null : prev));
    },
    /**
     * The only video anyone publishes into a stage is a screen share — nobody
     * has a camera in here — so a remote video track appearing IS the share.
     *
     * `Starting` is included alongside `Decoding` so the surface is mounted
     * before the first frame arrives: RtcSurfaceView has to exist for the SDK
     * to render into, and waiting for `Decoding` on a slow connection shows a
     * gap where the screen should be. `Frozen` is deliberately not cleared —
     * that is a stall, not a stop, and blanking on it would flicker the whole
     * panel every time the network hiccuped.
     */
    onRemoteVideoStateChanged: (
      _connection: RtcConnection,
      remoteUid: number,
      state: RemoteVideoState,
      _reason: RemoteVideoStateReason,
      _elapsed: number,
    ) => {
      if (
        state === RemoteVideoState.RemoteVideoStateStarting ||
        state === RemoteVideoState.RemoteVideoStateDecoding
      ) {
        setScreenShareUid(remoteUid);
      } else if (
        state === RemoteVideoState.RemoteVideoStateStopped ||
        state === RemoteVideoState.RemoteVideoStateFailed
      ) {
        setScreenShareUid(prev => (prev === remoteUid ? null : prev));
      }
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
    const tokenData = await fetchAgoraToken(channelName, agoraRole, 0, userAddressRef.current);
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
        // A web host can put their screen on the stage — see the receive-only
        // video setup in initStageEngine. Nothing else ever publishes video.
        autoSubscribeVideo: true,
      };
      engine.joinChannel(tokenData.token, channelName, tokenData.uid ?? 0, options);
      setIsConnected(true);

      // Host records the mixed channel audio for later transcription
      if (role === "host") {
        const recPath = `${FileSystem.cacheDirectory}stage_${space.id}_${Date.now()}.${RECORDING_EXT}`;
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
      // A soundboard clip is a mixing stream, not channel audio, so it
      // outlives leaveChannel and would keep playing into the next stage.
      engine.stopAudioMixing();
      await engine.leaveChannel();
    } catch (e) {
      log.warn("Stage leave error:", e);
    }
    setIsConnected(false);
    setIsMuted(true);
    setVoiceEffect("none");
    setPlayingSoundId(null);
    setActiveSpeakerUids([]);
    setScreenShareUid(null);
    return savedRecPath;
  }, []);

  // ── Upgrade listener → speaker when host approves ─────────────────────────

  const upgradeSpeakerRef = useRef<() => Promise<void>>(async () => {});
  /** startScheduledSpace falls back to a plain rejoin, and is defined above joinSpace. */
  const joinSpaceRef = useRef<(spaceId: string) => Promise<boolean>>(async () => false);

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

  /**
   * Soundboard playback.
   *
   * The clips are the same files web's soundboard serves out of its public
   * dir, fetched over the network and cached on disk rather than bundled:
   * they are unencoded WAV and total ~19.5MB, with one 9.7MB file among them,
   * so shipping them would roughly double the download size of the app for a
   * host-only novelty. Cached by URL, so each clip crosses the network once
   * per install and is instant after that.
   *
   * Playback itself is startAudioMixing, the route generateTts already uses —
   * that is what puts the sound in the channel rather than only in the host's
   * earpiece, and it is why this works while the host is muted. Agora allows
   * one mixing stream at a time, so a second pad cuts straight to the new clip
   * without any explicit stop, which is the DJ-deck behaviour web has.
   */
  const playSoundEffect = useCallback(async (url: string, id: string) => {
    setPlayingSoundId(id);
    try {
      const cacheName = `stage_sfx_${url.replace(/[^a-zA-Z0-9]/g, "_").slice(-96)}`;
      const cachePath = `${FileSystem.cacheDirectory}${cacheName}`;
      const existing = await FileSystem.getInfoAsync(cachePath);
      if (!existing.exists) {
        const { status } = await FileSystem.downloadAsync(url, cachePath);
        if (status !== 200) throw new Error(`Sound download failed (${status})`);
      }
      // startAudioMixing wants a plain filesystem path, not a file:// URL.
      const rawPath = cachePath.startsWith("file://")
        ? decodeURIComponent(cachePath.substring(7))
        : cachePath;
      getStageEngine().startAudioMixing(rawPath, false, 1);
    } catch (err) {
      log.error("Soundboard playback failed:", err);
      // Only clear if this pad is still the active one — a pad tapped while
      // this one was loading has already claimed the slot.
      setPlayingSoundId((cur) => (cur === id ? null : cur));
      throw err;
    }
  }, []);

  const stopSoundEffect = useCallback(() => {
    try {
      getStageEngine().stopAudioMixing();
    } catch (err) {
      log.warn("Failed to stop soundboard clip:", err);
    }
    setPlayingSoundId(null);
  }, []);

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
              if (sameWallet(p.wallet_address, userAddressRef.current) && p.role === "speaker" && myRoleRef.current === "listener") {
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
              if (sameWallet(r.wallet_address, userAddressRef.current)) setHasRaisedHand(false);
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
      const { data, error } = await signed(
        supabase
          .from("audio_spaces")
          .insert({
            host_wallet_address: userAddress,
            host_username: user?.username || null,
            host_avatar: persistableAvatar(user?.avatarImageUrl),
            title,
            description,
            status: "live",
            channel_name: channelName,
            speaker_count: 1,
            listener_count: 0,
            started_at: new Date().toISOString(),
          })
          .select()
          .single(),
      );
      if (error) throw error;
      const space = data as AudioSpace;

      // Add host as participant so they appear in the speakers list
      await signed(
        supabase.from("space_participants").insert({
          space_id: space.id,
          wallet_address: userAddress,
          username: user?.username || null,
          avatar: persistableAvatar(user?.avatarImageUrl),
          role: "host",
          is_muted: true,
        }),
      );

      const success = await joinStageChannel(space, "host");
      if (!success) {
        await signed(
          supabase.from("audio_spaces").update({ status: "ended" }).eq("id", space.id),
        );
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
  }, [userAddress, user, joinStageChannel, refreshSpaces, signed]);

  // ── Scheduling ────────────────────────────────────────────────────────────

  /**
   * Announce a stage for later. No Agora, no participant row — nothing exists
   * yet except the announcement itself and the link that points at it.
   */
  const scheduleSpace = useCallback(async (input: ScheduleSpaceInput): Promise<AudioSpace | null> => {
    if (!userAddress) return null;
    setIsLoading(true);
    try {
      // Minted now and kept for the whole life of the stage, so the link handed
      // out today is the room people walk into.
      const channelName = `stage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const { data, error } = await signed(
        supabase
          .from("audio_spaces")
          .insert({
            host_wallet_address: userAddress,
            host_username: user?.username || null,
            host_avatar: persistableAvatar(user?.avatarImageUrl),
            title: input.title,
            description: input.description,
            status: "scheduled",
            scheduled_at: input.scheduledAt,
            cover_image_url: input.coverImageUrl ?? null,
            channel_name: channelName,
            speaker_count: 0,
            listener_count: 0,
          })
          .select()
          .single(),
      );
      if (error) throw error;

      await refreshSpaces();
      return data as AudioSpace;
    } catch (err) {
      log.error("Failed to schedule space:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, user, refreshSpaces, signed]);

  /** Take a stage that was scheduled earlier live now. Host only. */
  const startScheduledSpace = useCallback(async (spaceId: string): Promise<boolean> => {
    if (!userAddress) return false;
    setIsLoading(true);
    try {
      const { data: existing, error: readErr } = await supabase
        .from("audio_spaces")
        .select("*")
        .eq("id", spaceId)
        .single();
      if (readErr || !existing) throw readErr || new Error("Stage not found");
      // Case-insensitive, like the RLS policies and dehubweb. A raw !==
      // depended on the auth layer normalising, and a row carrying a
      // checksummed address refused its own host.
      if (!sameWallet(existing.host_wallet_address, userAddress)) return false;
      if (existing.status === "live") return await joinSpaceRef.current(spaceId);
      if (existing.status !== "scheduled") return false;

      const { data, error } = await signed(
        supabase
          .from("audio_spaces")
          .update({
            status: "live",
            // started_at defaulted to the moment the row was inserted, which for
            // a scheduled stage is whenever it was announced. Stamp the real
            // start so duration and the recorded list stay honest.
            started_at: new Date().toISOString(),
            speaker_count: 1,
          })
          .eq("id", spaceId)
          .select()
          .single(),
      );
      if (error) throw error;
      const space = data as AudioSpace;

      await signed(
        supabase.from("space_participants").insert({
          space_id: space.id,
          wallet_address: userAddress,
          username: user?.username || null,
          avatar: persistableAvatar(user?.avatarImageUrl),
          role: "host",
          is_muted: true,
        }),
      );

      const success = await joinStageChannel(space, "host");
      if (!success) {
        // Back to scheduled, not ended — a failed start must not quietly
        // destroy an announcement people are already holding a link to.
        await signed(
          supabase.from("audio_spaces").update({ status: "scheduled" }).eq("id", space.id),
        );
        throw new Error("Failed to join Agora channel");
      }

      setCurrentSpace(space);
      setMyRole("host");
      setIsMuted(true);
      await refreshSpaces();
      return true;
    } catch (err) {
      log.error("Failed to start scheduled space:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, user, joinStageChannel, refreshSpaces, signed]);

  /** Call off a scheduled stage. Host only; the row is removed outright. */
  const cancelScheduledSpace = useCallback(async (spaceId: string): Promise<boolean> => {
    if (!userAddress) return false;
    try {
      // The delete policy compares the host wallet to the x-wallet-address
      // header, and the plain client never sends it — without this the row
      // silently stays.
      const { error } = await withWalletHeader(
        supabase.from("audio_spaces").delete().eq("id", spaceId).eq("status", "scheduled"),
        userAddress,
      );
      if (error) throw error;
      await refreshSpaces();
      return true;
    } catch (err) {
      log.error("Failed to cancel scheduled space:", err);
      return false;
    }
  }, [userAddress, refreshSpaces]);

  /**
   * Delete an ended stage's record, matching dehubweb's PastStagesList
   * handleDelete: remove the storage recording first (if any), then the row.
   * Host only -- callers gate the button on sameWallet(host_wallet_address),
   * and the delete policy independently checks the same thing server-side
   * against the x-wallet-address header.
   */
  const deleteEndedSpace = useCallback(async (space: AudioSpace): Promise<boolean> => {
    if (!userAddress) return false;
    try {
      if (space.recording_url) {
        const path = space.recording_url.split("/stage-recordings/")[1];
        if (path) {
          const { error: storageError } = await supabase.storage
            .from("stage-recordings")
            .remove([decodeURIComponent(path)]);
          // Not fatal -- an orphaned recording file is a storage-quota
          // problem, not a reason to leave the row (and its transcript,
          // wrong listing) behind for the host to keep seeing.
          if (storageError) log.warn("Failed to remove stage recording file:", storageError);
        }
      }
      const { error } = await withWalletHeader(
        supabase.from("audio_spaces").delete().eq("id", space.id).eq("status", "ended"),
        userAddress,
      );
      if (error) throw error;
      await refreshSpaces();
      return true;
    } catch (err) {
      log.error("Failed to delete ended space:", err);
      return false;
    }
  }, [userAddress, refreshSpaces]);

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

      // Work out what this wallet comes back AS before writing anything. The
      // upsert below collides on (space_id, wallet_address), so joining with a
      // hardcoded "listener" overwrote the row the host already held: it
      // demoted them in everyone's participant list, handed them a subscriber
      // token so they could not talk in their own room, and left the auto-end
      // trigger with no row marked `host` to act on.
      const isHost = sameWallet(space.host_wallet_address, userAddress);
      const { data: existingParticipant } = await supabase
        .from("space_participants")
        .select("role")
        .eq("space_id", spaceId)
        .eq("wallet_address", userAddress)
        .is("left_at", null)
        .maybeSingle();

      const rejoiningRole: SpaceRole = isHost
        ? "host"
        : existingParticipant?.role === "speaker" || existingParticipant?.role === "host"
          ? "speaker"
          : "listener";

      await signed(
        supabase.from("space_participants").upsert({
          space_id: spaceId,
          wallet_address: userAddress,
          username: user?.username || null,
          avatar: persistableAvatar(user?.avatarImageUrl),
          role: rejoiningRole,
          is_muted: true,
          left_at: null,
        }, { onConflict: "space_id,wallet_address" }),
      );

      await recountSpace(spaceId);

      const success = await joinStageChannel(space, rejoiningRole);
      if (!success) return false;

      setCurrentSpace(space);
      setMyRole(rejoiningRole);
      setIsMuted(true);
      setHasRaisedHand(false);
      return true;
    } catch (err) {
      log.error("Failed to join space:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [userAddress, user, joinStageChannel, signed]);

  joinSpaceRef.current = joinSpace;

  // Matches dehubweb's guestListen(): a signed-out visitor on an invite link
  // can hear the room without an account. joinStageChannel/fetchAgoraToken
  // already only attach auth headers for the publisher role, so a subscriber
  // request here needs no wallet at all -- nothing server-side to change.
  const guestListenSpace = useCallback(async (spaceId: string): Promise<boolean> => {
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

      const success = await joinStageChannel(space, "listener");
      if (!success) return false;

      setCurrentSpace(space);
      setMyRole(null);
      setIsMuted(true);
      setHasRaisedHand(false);
      return true;
    } catch (err) {
      log.error("Failed to join space as guest:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [joinStageChannel]);

  const leaveSpace = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (space && userAddress) {
      // Soft delete — preserve history by setting left_at
      await signed(
        supabase.from("space_participants")
          .update({ left_at: new Date().toISOString() })
          .eq("space_id", space.id)
          .eq("wallet_address", userAddress),
      );

      await recountSpace(space.id);
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
  }, [userAddress, leaveStageChannel, closeModal, refreshSpaces, signed]);

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

      // Agora writes a raw ADTS AAC elementary stream (startAudioRecording with
      // encode: true) — there is no MP4 container anywhere in these bytes, and
      // the SDK offers no option to write one. Name and type the object after
      // what it actually is: transcribe-stage forwards both on to the speech
      // service, and dehubweb hands the same URL to a bare <audio> element that
      // has nothing but the Content-Type to go on.
      const result = await FileSystem.uploadAsync(
        `${env.SUPABASE_URL}/storage/v1/object/stage-recordings/${spaceId}/${RECORDING_OBJECT}`,
        recPath,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
            apikey: env.SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": RECORDING_MIME,
            "x-upsert": "true",
          },
        },
      );

      log.info(`Upload response status: ${result.status}`);
      if (result.status >= 200 && result.status < 300) {
        // Update recording_url in audio_spaces
        const recordingUrl = `${env.SUPABASE_URL}/storage/v1/object/public/stage-recordings/${spaceId}/${RECORDING_OBJECT}`;
        const { error: updateErr } = await signed(
          supabase
            .from("audio_spaces")
            .update({ recording_url: recordingUrl })
            .eq("id", spaceId),
        );
        if (updateErr) {
          log.error("Failed to update space recording_url in database:", updateErr);
        } else {
          log.info("Successfully updated recording_url in database");
        }

        // Finalize, then transcribe. An ADTS stream carries no duration and no
        // index, so ExoPlayer reports duration 0 and drops every seek — the
        // scrubber below is dead until this runs. finalize-stage-recording
        // re-wraps the same AAC frames in an MP4 (no transcode, identical
        // audio), repoints recording_url at it, and chains into
        // transcribe-stage itself, including when the remux fails.
        try {
          await supabase.functions.invoke("finalize-stage-recording", { body: { stageId: spaceId, timeline: [] } });
          log.info("Recording finalize + transcription triggered for stage:", spaceId);
        } catch (finalizeErr) {
          log.error("Failed to trigger stage finalize:", finalizeErr);
        }
      } else {
        log.error(`Recording upload to Supabase storage failed with status ${result.status}. Response: ${result.body}`);
      }

      // Clean up local file regardless
      await FileSystem.deleteAsync(recPath, { idempotent: true });
    } catch (err) {
      log.error("Recording upload failed (non-fatal):", err);
    }
  }, [signed]);

  const endSpace = useCallback(async () => {
    const space = currentSpaceRef.current;
    const spaceId = space?.id;
    // Capture recording path before leaveSpace() nulls it out
    const recPath = recordingPathRef.current;
    if (space && myRoleRef.current === "host") {
      await signed(
        supabase.from("audio_spaces")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", space.id),
      );
    }
    await leaveSpace();
    // Upload recording in background after leaving (non-blocking)
    if (recPath && spaceId) {
      uploadAndTranscribe(recPath, spaceId);
    }
  }, [leaveSpace, uploadAndTranscribe, signed]);

  const toggleMute = useCallback(() => {
    if (myRole === "listener") return;
    const next = !isMuted;
    getStageEngine().muteLocalAudioStream(next);
    setIsMuted(next);
    const space = currentSpaceRef.current;
    if (space && userAddress) {
      // `void`, not bare: a postgrest builder only issues its request inside
      // then(), so an un-awaited chain here sent nothing at all — every remote
      // participant stayed at the is_muted: true written on join, so the room
      // rendered everyone permanently muted however much they talked.
      void signed(
        supabase.from("space_participants")
          .update({ is_muted: next })
          .eq("space_id", space.id)
          .eq("wallet_address", userAddress),
      ).then(({ error }) => {
        if (error) log.error("Failed to persist mute state:", error);
      });
    }
  }, [isMuted, myRole, userAddress, signed]);

  const raiseHand = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (!space || !userAddress || myRole !== "listener" || hasRaisedHand) return;
    await signed(
      supabase.from("raise_hand_requests").insert({
        space_id: space.id,
        wallet_address: userAddress,
        username: user?.username || null,
        avatar: persistableAvatar(user?.avatarImageUrl),
        status: "pending",
      }),
    );
    setHasRaisedHand(true);
  }, [userAddress, user, myRole, hasRaisedHand, signed]);

  const lowerHand = useCallback(async () => {
    const space = currentSpaceRef.current;
    if (!space || !userAddress) return;
    await signed(
      supabase.from("raise_hand_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("space_id", space.id)
        .eq("wallet_address", userAddress)
        .eq("status", "pending"),
    );
    setHasRaisedHand(false);
  }, [userAddress, signed]);

  const approveSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await signed(
      supabase.from("raise_hand_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString() })
        .eq("space_id", space.id)
        .eq("wallet_address", walletAddress)
        .eq("status", "pending"),
    );

    await signed(
      supabase.from("space_participants")
        .update({ role: "speaker", is_muted: true })
        .eq("space_id", space.id)
        .eq("wallet_address", walletAddress),
    );

    // Recount rather than ±1: the arithmetic assumed the promoted wallet was a
    // listener sitting in the count and moved both figures even when it was
    // not, so a promotion could leave the room reporting a listener it did not
    // have.
    await recountSpace(space.id);
  }, [signed]);

  const removeSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await signed(
      supabase.from("space_participants")
        .update({ role: "listener", is_muted: true })
        .eq("space_id", space.id)
        .eq("wallet_address", walletAddress),
    );

    await recountSpace(space.id);
  }, [signed]);

  const inviteSpeaker = useCallback(async (walletAddress: string) => {
    const space = currentSpaceRef.current;
    if (!space || myRoleRef.current !== "host") return;

    await signed(
      supabase.from("space_participants")
        .update({ role: "speaker", is_muted: true })
        .eq("space_id", space.id)
        .eq("wallet_address", walletAddress),
    );

    await recountSpace(space.id);
  }, [signed]);



  // ── Transcript fetch ───────────────────────────────────────────────────────

  const fetchTranscript = useCallback(async (spaceId: string) => {
    setIsTranscriptLoading(true);
    try {
      // One store for stage and video transcripts alike; the columns are
      // aliased back to the names callers already use.
      const { data, error } = await supabase
        .from("transcripts")
        .select(
          "id, stage_id:source_ref, status, source_language:source_lang, full_text, segments, " +
            "speaker_map, speaker_overrides, summary, chapters, summary_status, " +
            "privacy:visibility, attempts, error, created_at",
        )
        .eq("source_kind", "stage")
        .eq("source_ref", spaceId)
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

  // Memoised because StageProvider hands this straight to its context value and
  // wraps the entire navigator. A fresh object literal gave every consumer —
  // AppDrawer, UploadScreen, every stage modal — a new context value on each of
  // this hook's two dozen state updates, whether or not the field they read had
  // moved.
  //
  // Deps come from Object.values rather than a hand-written list: the shape is a
  // fixed object literal, so the array length is stable across renders, and a
  // 45-name list would drift out of sync the first time a field was added.
  const fields = {
    liveSpaces,
    pastSpaces,
    scheduledSpaces,
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
    screenShareUid,
    transcript,
    isTranscriptLoading,
    openModal,
    closeModal,
    createSpace,
    scheduleSpace,
    startScheduledSpace,
    cancelScheduledSpace,
    deleteEndedSpace,
    joinSpace,
    guestListenSpace,
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
    playingSoundId,
    playSoundEffect,
    stopSoundEffect,
    inviteSpeaker,
    fetchTranscript,
    refreshSpaces,
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => fields, Object.values(fields));
}
