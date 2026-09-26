import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  LayoutChangeEvent,
} from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import { useScrubGesture } from "../../hooks/useScrubGesture";
import { useHorizontalScrollGuard } from "../../context/PagerGestureContext";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCachedHue, setHueState } from "../../libs/audioHueState";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { createAudioPlayer, type AudioPlayer, type AudioStatus } from "expo-audio";
import type { EventSubscription } from "expo-modules-core";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { configureForBackgroundPlayback } from "../../libs/audioSession";
import { claimLockScreen, releaseLockScreen } from "../../libs/lockScreen";
import { stopActivePreview } from "../../libs/previewRegistry";
import { recordListen } from "../../services/audio.service";
import {
  popOutAudioPost,
  seekAudioPost,
  setAudioPostVolume,
  takeBackAudioPost,
  toggleAudioPost,
  useAudioPostPlayback,
} from "../../libs/audio-post-playback";
import {
  AudioVisualizer,
  StaticWaveform,
  VISUALIZER_STYLES,
  type VisualizerStyle,
} from "./AudioVisualizers";

/* ─── Constants ─────────────────────────────────────────────── */
// Matches FeedVideoPlayer's AUTOPLAY_DELAY: how long a card must stay visible
// before it is treated as scrolled-to rather than scrolled-past.
const PRELOAD_SETTLE_MS = 400;

/**
 * Skip buttons on the lock screen. An audio post is a finite file with a real
 * seek map behind it, so unlike a live radio stream they do something.
 */
const LOCK_SCREEN_CONTROLS = { showSeekForward: true, showSeekBackward: true };

/** One height for every control, so the row reads as a row. */
const CONTROL_SIZE = 32;

/**
 * The media window's shape — the same 16:9 the web card gives an audio post.
 * The visualizer fills it edge to edge and the controls sit on top of it. It
 * used to be a 60px band wedged between rows of chrome, so an animated style
 * played in a letterbox strip while the rest of the card sat black around it.
 */
const MEDIA_ASPECT = 16 / 9;

export const fmtDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Hands a native control that owns sideways movement — a slider, a pill strip —
 * priority over the Home pager's page turn. Outside a pager it renders nothing
 * of its own.
 */
const PagerSafe: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const guard = useHorizontalScrollGuard();
  return guard ? <GestureDetector gesture={guard}>{children}</GestureDetector> : children;
};

/* ─── Seek gestures ──────────────────────────────────────────────────────
   Two kinds of surface want to scrub, and they must not behave the same way.

   The slim bar under the artwork is a deliberate target, so it claims the
   touch immediately: tap to jump, drag to scrub.

   The artwork itself is 60px of the card, sitting in a vertically scrolling
   feed. It used to claim every touch that started on it, which meant a finger
   landing on an audio post could not scroll the feed at all — so it now only
   takes over once a gesture is clearly sideways, and a vertical flick passes
   straight through to the list.

   Both are gesture-handler gestures rather than PanResponders, so that inside
   the Home pager they can block the page turn while a scrub is running — see
   useScrubGesture. */
interface SeekSurfaceArgs {
  position: SharedValue<number>;
  onScrubStart: () => void;
  onScrub: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
  claimOnStart: boolean;
  enabled?: boolean;
}

export const useSeekSurface = ({
  position,
  onScrubStart,
  onScrub,
  onCommit,
  onCancel,
  claimOnStart,
  enabled = true,
}: SeekSurfaceArgs) => {
  const handleScrubStart = useCallback(() => onScrubStart(), [onScrubStart]);

  const handleScrub = useCallback(
    (ratio: number) => {
      position.value = ratio; // UI thread, no React re-render per pixel
      onScrub(ratio);
    },
    [position, onScrub],
  );

  const handleCommit = useCallback(
    (ratio: number) => {
      position.value = ratio;
      onCommit(ratio);
    },
    [position, onCommit],
  );

  return useScrubGesture({
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleCommit,
    onCancel,
    enabled,
    immediate: claimOnStart,
  });
};

/**
 * Wraps a scrub surface's content so the gesture lives on an ancestor view —
 * the visualizers paint into their own trees and only need the touches to
 * reach them.
 */
export const ScrubSurface: React.FC<{
  surface: ReturnType<typeof useSeekSurface>;
  style?: any;
  children: React.ReactNode;
}> = ({ surface, style, children }) => (
  <GestureDetector gesture={surface.gesture}>
    <View onLayout={surface.onLayout} style={style} {...surface.touchGuard}>
      {children}
    </View>
  </GestureDetector>
);

/* ─── SeekBar — the scrubber, live in every visualizer style ────
   The old build painted a 3px progress line that could only be watched: there
   was no way to move through a track at all, and the animated styles did not
   even show where you were. */
interface SeekBarProps {
  position: SharedValue<number>;
  hue: number;
}

export const SeekBar: React.FC<SeekBarProps> = memo(({ position, hue }) => {
  const accent = hue === 0 ? "rgba(255,255,255,0.9)" : `hsla(${hue}, 85%, 65%, 0.95)`;

  const fillStyle = useAnimatedStyle(() => ({
    width: `${position.value * 100}%`,
    backgroundColor: accent,
  }));
  const knobStyle = useAnimatedStyle(() => ({
    left: `${position.value * 100}%`,
  }));

  return (
    <View
      style={{ height: 18, justifyContent: "center" }}
      hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
    >
      <View className="h-[3px] bg-white/20 rounded-full overflow-hidden">
        <Animated.View style={[{ height: 3, borderRadius: 2 }, fillStyle]} />
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 3.5, // centres the 11px knob over the 3px track in an 18px row
            width: 11,
            height: 11,
            marginLeft: -5.5,
            borderRadius: 6,
            backgroundColor: "#fff",
          },
          knobStyle,
        ]}
      />
    </View>
  );
});

/* ─── Style Picker Pill ─────────────────────────────────────── */
interface StylePickerProps {
  style: VisualizerStyle;
  onStyleChange: (s: VisualizerStyle) => void;
}

const StylePicker: React.FC<StylePickerProps> = memo(({ style: activeStyle, onStyleChange }) => (
  <PagerSafe>
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
    contentContainerStyle={{ flexDirection: "row", gap: 4, alignItems: "center" }}
  >
    {VISUALIZER_STYLES.map((s) => {
      const isActive = activeStyle === s.value;
      return (
        <Pressable
          key={s.value}
          onPress={() => onStyleChange(s.value)}
          hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 8,
            backgroundColor: isActive ? "rgba(255,255,255,0.12)" : "transparent",
            borderWidth: isActive ? 1 : 0,
            borderColor: "rgba(255,255,255,0.15)",
          }}
        >
          <Text
            style={{
              color: isActive ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
              fontSize: 10,
              fontWeight: isActive ? "600" : "400",
            }}
          >
            {s.label}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
  </PagerSafe>
));

/* ─── Color Hue Slider ──────────────────────────────────────── */
interface HueSliderProps {
  hue: number;
  onHueChange: (h: number) => void;
}

const HueSlider: React.FC<HueSliderProps> = memo(({ hue, onHueChange }) => {
  // Local state so drag is silky — parent only gets notified on release
  const [localHue, setLocalHue] = useState(hue);

  // Sync if parent hue changes externally (e.g. initial load)
  useEffect(() => { setLocalHue(hue); }, [hue]);

  const previewColor = localHue === 0
    ? "rgba(255,255,255,0.9)"
    : `hsl(${localHue}, 80%, 65%)`;

  return (
    <View style={{ height: 32, width: 104, justifyContent: "center" }}>
      <LinearGradient
        colors={["#ff0000","#ffff00","#00ff00","#00ffff","#0000ff","#ff00ff","#ff0000"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          position: "absolute",
          left: 10,
          right: 10,
          height: 10,
          borderRadius: 5,
        }}
      />
      <PagerSafe>
      <Slider
        style={{ width: "100%" }}
        minimumValue={0}
        maximumValue={360}
        step={1}
        value={localHue}
        onValueChange={setLocalHue}
        onSlidingComplete={onHueChange}
        minimumTrackTintColor="transparent"
        maximumTrackTintColor="transparent"
        thumbTintColor={previewColor}
      />
      </PagerSafe>
    </View>
  );
});

export interface AudioPostPlayerProps {
  audioUrl: string;
  duration?: number;
  tokenId: string | number;
  isVisible?: boolean;
  compact?: boolean;
  isSignedIn?: boolean;
  /**
   * What the OS shows while this track holds the lock screen. Worth passing
   * wherever the surface knows them — a notification reading "Untitled" is
   * only marginally better than no notification.
   */
  title?: string;
  artist?: string;
  artworkUrl?: string;
  topLeftAction?: React.ReactNode;
}

const AudioPostPlayerComponent: React.FC<AudioPostPlayerProps> = ({
  audioUrl,
  duration = 0,
  tokenId,
  isVisible = true,
  compact = false,
  isSignedIn = false,
  title,
  artist,
  artworkUrl,
  topLeftAction,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const playerRef = useRef<AudioPlayer | null>(null);
  /** The card's status subscription, so it can be dropped when the player moves. */
  const statusSubRef = useRef<EventSubscription | null>(null);
  const seed = String(tokenId);
  /**
   * This card's identity in the app-wide lock screen slot, which only one
   * player may own (see libs/lockScreen). Keyed by token so two cards for the
   * same track cannot both believe they hold it.
   */
  const lockScreenId = `audio-post:${tokenId}`;
  const resolvedTitle = title || t("audioPost.untitled");
  const resolvedArtist = artist || t("audioPost.creator");
  const lockScreenTrack = useMemo(
    () => ({
      title: resolvedTitle,
      artist: resolvedArtist,
      albumTitle: "DeHub • Audio",
      artworkUrl: artworkUrl || undefined,
    }),
    [resolvedTitle, resolvedArtist, artworkUrl],
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [hue, setHue] = useState(() => getCachedHue());
  const [vizStyle, setVizStyle] = useState<VisualizerStyle>("static");
  const [volume, setVolume] = useState(1);
  const [selfMuted, setSelfMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The media window is measured, not fixed: the visualizer needs a height to
  // draw into, and the inline card and the fullscreen modal have different ones.
  const [inlineHeight, setInlineHeight] = useState(0);
  const [fullHeight, setFullHeight] = useState(0);
  const listenRecordedRef = useRef(false);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSeekingRef = useRef(false);
  const lastSeekTimeRef = useRef(0);
  const isFocused = useIsFocused();
  const preloadedRef = useRef(false);
  // A seek asked for before the track finished loading. Applied once it does,
  // instead of being dropped on the floor as it used to be.
  const pendingSeekRef = useRef<number | null>(null);
  // The displayed playhead, 0–1. Shared so a drag moves the waveform and the
  // scrubber on the UI thread without a React render per pixel.
  const position = useSharedValue(0);
  const isDraggingRef = useRef(false);
  // Read at player-creation time, so a level set before the track loaded is not
  // lost the moment it does.
  const volumeRef = useRef(1);

  /* ─── The corner player ──────────────────────────────────────
     While this post is popped out, the track lives in libs/audio-post-playback
     and this card is a view onto it: every number below comes from there, and
     play, seek and volume are forwarded rather than applied to a player of
     its own. The card owns nothing until it takes the player back. */
  const shared = useAudioPostPlayback();
  const isPoppedOut = shared.tokenId === seed;
  const isPoppedOutRef = useRef(isPoppedOut);
  isPoppedOutRef.current = isPoppedOut;
  const sharedProgressRef = useRef(0);
  if (isPoppedOut) sharedProgressRef.current = shared.progress;

  const shownPlaying = isPoppedOut ? shared.isPlaying : isPlaying;
  const shownLoading = isPoppedOut ? shared.isLoading : isLoading;
  const shownProgress = isPoppedOut ? shared.progress : progress;
  const shownTime = isPoppedOut ? shared.currentTime : currentTime;
  const shownDuration = isPoppedOut && shared.duration > 0 ? shared.duration : totalDuration;
  const totalDurationRef = useRef(duration);
  totalDurationRef.current = shownDuration;
  const progressRef = useRef(0);
  progressRef.current = shownProgress;

  const focusStopRef = useRef(() => {
    playerRef.current?.pause();
    releaseLockScreen(lockScreenId);
    setIsPlaying(false);
    stopPositionTracking();
    releaseAudioFocus(focusStopRef.current);
  });

  useEffect(() => {
    if (isDraggingRef.current) return;
    position.value = withTiming(clamp01(shownProgress), { duration: 100, easing: Easing.linear });
  }, [shownProgress, position]);

  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) return;
    positionIntervalRef.current = setInterval(async () => {
      // Suppress stale position reads during seek or right after
      if (isSeekingRef.current || Date.now() - lastSeekTimeRef.current < 600) return;
      try {
        const player = playerRef.current;
        if (!player || !player.isLoaded) return;
        // expo-audio hangs position and duration off the player as plain
        // seconds, so this no longer awaits a status round trip ten times a
        // second.
        const pos = player.currentTime;
        const dur = player.duration || duration;
        setCurrentTime(pos);
        if (dur > 0) {
          setProgress(pos / dur);
          setTotalDuration(dur);
        }
      } catch {}
    }, 100);
  }, [duration]);

  const stopPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
  }, []);

  /** Apply a seek that was asked for before the sound existed. */
  /**
   * Apply a seek that was asked for before the track could take one.
   *
   * The pending value is only consumed once it has actually been applied.
   * expo-audio hands back a player immediately and loads behind it, unlike
   * expo-av'"'"'s awaited createAsync, so this runs against a player with no
   * duration yet on the first call and again from the status listener the
   * moment there is one. Clearing it up front would drop the gesture.
   */
  const applyPendingSeek = useCallback(async (player: AudioPlayer) => {
    const pending = pendingSeekRef.current;
    if (pending === null) return;
    if (!player.isLoaded || !(player.duration > 0)) return;
    pendingSeekRef.current = null;
    try {
      await player.seekTo(pending * player.duration);
    } catch {}
  }, []);

  /**
   * The one status listener, whichever path created the player. Kept as a
   * subscription so it can be dropped when the player is handed to the corner
   * player, and re-attached when it comes back.
   */
  const attachStatusListener = useCallback((player: AudioPlayer) => {
    statusSubRef.current?.remove();
    statusSubRef.current = player.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      if (!status.isLoaded) return;
      if (status.duration > 0) {
        setTotalDuration(status.duration);
        void applyPendingSeek(player);
      }
      if (status.didJustFinish) {
        setIsPlaying(false);
        setProgress(1);
        stopPositionTracking();
        releaseLockScreen(lockScreenId);
        releaseAudioFocus(focusStopRef.current);
      }
    });
  }, [applyPendingSeek, stopPositionTracking, lockScreenId]);

  const detachStatusListener = useCallback(() => {
    statusSubRef.current?.remove();
    statusSubRef.current = null;
  }, []);

  // Still recorded — the tally feeds creator analytics and admin. It is just
  // not printed next to the card's view count any more: two numbers for the
  // same post, one an order of magnitude smaller, read as a contradiction.
  const recordListenOnce = useCallback(() => {
    if (listenRecordedRef.current || !isSignedIn) return;
    listenRecordedRef.current = true;
    recordListen(String(tokenId)).catch(() => {});
  }, [isSignedIn, tokenId]);

  useEffect(() => {
    if (!isVisible || !isFocused || preloadedRef.current) return;
    // The corner player has this track; a silent second copy buys nothing.
    if (isPoppedOut) return;
    let cancelled = false;
    // Same settle grace the video cards use: becoming 50% visible mid-fling
    // used to start a download (and reconfigure the global audio session) for
    // every audio card the viewport passed over. Only a card the scroll
    // actually stopped on is worth preloading. The audio mode is set at play
    // time now — preloading with shouldPlay: false doesn't need the session.
    const settleTimer = setTimeout(async () => {
      try {
        const player = createAudioPlayer({ uri: audioUrl }, { updateInterval: 100 });
        // `cancelled` only covers the card going away — the effect's deps are
        // isVisible/isFocused/audioUrl. A play tap changes none of them, so
        // without the playerRef check below this assignment could land AFTER
        // handlePlayPause had already created and started its own player,
        // overwriting the reference to the audible one with this silent one.
        // Pause, seek, volume and the unmount cleanup all go through
        // playerRef, so the track kept playing with nothing able to stop it
        // and a native player leaked for the life of the process.
        if (cancelled || playerRef.current) {
          player.remove();
          return;
        }
        playerRef.current = player;
        player.volume = volumeRef.current;
        preloadedRef.current = true;

        attachStatusListener(player);

        await applyPendingSeek(player);
      } catch (e) {
        // Preload failed — will load on play tap
      }
    }, PRELOAD_SETTLE_MS);
    return () => { cancelled = true; clearTimeout(settleTimer); };
  }, [isVisible, isFocused, audioUrl, isPoppedOut, attachStatusListener, applyPendingSeek]);

  useEffect(() => {
    if (isVisible && isFocused) return;

    // A hidden card cannot be heard or interacted with, so keeping its native
    // decoder and OkHttp buffers buys nothing. Home deliberately keeps every
    // feed tab mounted; pausing here without removing the player therefore
    // retained one decoder per audio card the user had scrolled past. On
    // Android those buffers accumulated across tab switches until MediaCodec,
    // Okio or DirectByteBuffer was the allocation that finally OOMed.
    stopPositionTracking();
    releaseLockScreen(lockScreenId);
    releaseAudioFocus(focusStopRef.current);

    const player = playerRef.current;
    if (player) {
      detachStatusListener();
      try { player.pause(); } catch {}
      try { player.remove(); } catch {}
      playerRef.current = null;
    }
    preloadedRef.current = false;
    setIsPlaying(false);
    setIsLoading(false);
  }, [isVisible, isFocused, stopPositionTracking, detachStatusListener, lockScreenId]);

  useEffect(() => {
    const stopFn = focusStopRef.current;
    return () => {
      stopPositionTracking();
      releaseAudioFocus(stopFn);
      // Ownership-checked, so a card scrolling out of the list after another
      // track has taken the lock screen leaves that one alone.
      releaseLockScreen(lockScreenId);
      // A popped-out track has already left with its player: playerRef is
      // null and the corner player carries on after this card is gone.
      const player = playerRef.current;
      if (player) {
        detachStatusListener();
        player.remove();
        playerRef.current = null;
      }
    };
  }, [stopPositionTracking]);

  // The corner player closed on this track — its X, or something else took
  // the audio — while this card was on screen. Rest where it stopped rather
  // than snapping back to the start. Docking back hands the player to this
  // card before the state flips, so there is nothing to reconcile then.
  const wasPoppedOutRef = useRef(isPoppedOut);
  useEffect(() => {
    const was = wasPoppedOutRef.current;
    wasPoppedOutRef.current = isPoppedOut;
    if (!was || isPoppedOut || playerRef.current) return;
    const at = sharedProgressRef.current;
    const resting = at > 0 && at < 0.999 ? at : 0;
    setIsPlaying(false);
    setIsLoading(false);
    setProgress(resting);
    setCurrentTime(resting * totalDurationRef.current);
    pendingSeekRef.current = resting > 0 ? resting : null;
  }, [isPoppedOut]);

  const handlePlayPause = useCallback(async () => {
    if (isPoppedOutRef.current) {
      toggleAudioPost();
      return;
    }
    try {
      if (isPlaying && playerRef.current) {
        playerRef.current.pause();
        setIsPlaying(false);
        stopPositionTracking();
        // The lock screen claim is kept, not released: a paused track you can
        // start again without unlocking the phone is the point of having it.
        releaseAudioFocus(focusStopRef.current);
        return;
      }

      requestAudioFocus(focusStopRef.current);
      stopActivePreview();

      // Moved here from the preload path: the session only needs configuring
      // once something actually plays, and setting the global session per
      // scrolled-past card was main-thread work mid-fling.
      //
      // Background playback only on a deliberate press of play. An audio post
      // is the one thing on the feed you obviously want to keep hearing with
      // the screen off — stopping it at lock was never a decision, it was the
      // default nobody revisited.
      //
      // doNotMix rather than the ducking this used to ask for: on iOS the Now
      // Playing controls only appear while the category is doNotMix or auto,
      // so ducking silently costs the lock screen.
      //
      // Muted video cards do not inherit this. The session category is global
      // to the process and the last writer wins, but FeedVideoPlayer stops
      // itself whenever AppState leaves "active", so a preview cannot ride a
      // background-capable session out of the foreground.
      await configureForBackgroundPlayback();

      const loaded = playerRef.current;
      if (loaded?.isLoaded) {
        await applyPendingSeek(loaded);
        if (loaded.duration > 0 && loaded.currentTime >= loaded.duration - 0.05) {
          await loaded.seekTo(0);
          listenRecordedRef.current = false;
        }
        loaded.play();
        claimLockScreen(lockScreenId, loaded, lockScreenTrack, LOCK_SCREEN_CONTROLS);
        setIsPlaying(true);
        startPositionTracking();
        recordListenOnce();
        return;
      }

      setIsLoading(true);
      const player = createAudioPlayer({ uri: audioUrl }, { updateInterval: 100 });
      // The mirror of the preload guard: if the settle timer's player landed
      // while this one was loading, release it rather than dropping the
      // reference on the floor — an unreferenced player is never freed.
      if (playerRef.current && playerRef.current !== player) {
        detachStatusListener();
        playerRef.current.remove();
      }
      playerRef.current = player;
      player.volume = volumeRef.current;
      preloadedRef.current = true;

      attachStatusListener(player);

      await applyPendingSeek(player);
      player.play();
      claimLockScreen(lockScreenId, player, lockScreenTrack, LOCK_SCREEN_CONTROLS);

      setIsPlaying(true);
      setIsLoading(false);
      startPositionTracking();
      recordListenOnce();
    } catch (e) {
      console.error("[AudioPostPlayer] playback error", e);
      setIsLoading(false);
      releaseAudioFocus(focusStopRef.current);
    }
  }, [isPlaying, audioUrl, startPositionTracking, stopPositionTracking, applyPendingSeek, attachStatusListener, detachStatusListener, recordListenOnce, lockScreenId, lockScreenTrack]);

  /**
   * Take a player back from the corner player, still playing if it was. The
   * card's own focus and lock screen claims replace the engine's.
   */
  const adoptPlayer = useCallback((player: AudioPlayer, playing: boolean) => {
    playerRef.current = player;
    preloadedRef.current = true;
    player.volume = volumeRef.current;
    attachStatusListener(player);
    if (player.isLoaded && player.duration > 0) {
      setTotalDuration(player.duration);
      setCurrentTime(player.currentTime);
      setProgress(clamp01(player.currentTime / player.duration));
    }
    setIsLoading(false);
    if (playing) {
      requestAudioFocus(focusStopRef.current);
      claimLockScreen(lockScreenId, player, lockScreenTrack, LOCK_SCREEN_CONTROLS);
      setIsPlaying(true);
      startPositionTracking();
    } else {
      setIsPlaying(false);
    }
  }, [attachStatusListener, lockScreenId, lockScreenTrack, startPositionTracking]);

  /**
   * Pop out — or dock back. Popping out hands this card's player, loaded or
   * loading, to the corner player as-is: no second download, no gap. It also
   * starts the track if it was idle, which is the only reading of the control
   * that makes sense from a card nobody has pressed play on. The fullscreen
   * modal closes on the way: a corner player you cannot browse past is no
   * corner player.
   */
  const handlePopOut = useCallback(() => {
    if (isPoppedOut) {
      const wasPlaying = shared.isPlaying;
      const player = takeBackAudioPost(seed);
      if (player) adoptPlayer(player, wasPlaying);
      return;
    }

    setIsFullscreen(false);
    stopPositionTracking();
    detachStatusListener();
    const player = playerRef.current;
    playerRef.current = null;
    preloadedRef.current = false;
    // The card's claims go with the player; the engine takes both under its
    // own name, and releasing first stops the focus hand-off from calling
    // this card's stop function against a player it no longer holds.
    releaseLockScreen(lockScreenId);
    releaseAudioFocus(focusStopRef.current);
    setIsPlaying(false);
    setIsLoading(false);

    const at = pendingSeekRef.current ?? progressRef.current;
    pendingSeekRef.current = null;
    popOutAudioPost({
      track: {
        tokenId: seed,
        audioUrl,
        title: resolvedTitle,
        artist: resolvedArtist,
        artworkUrl: artworkUrl || undefined,
      },
      player,
      volume: volumeRef.current,
      startAt: player?.isLoaded ? null : at > 0 && at < 0.999 ? at : null,
    });
    recordListenOnce();
  }, [isPoppedOut, shared.isPlaying, seed, adoptPlayer, stopPositionTracking, detachStatusListener, lockScreenId, audioUrl, resolvedTitle, resolvedArtist, artworkUrl, recordListenOnce]);

  /* ─── Seeking ─────────────────────────────────────────────── */

  const handleScrubStart = useCallback(() => {
    isDraggingRef.current = true;
    isSeekingRef.current = true;
  }, []);

  // One React update per displayed second while dragging, not one per frame:
  // the waveform and scrubber follow the finger off the shared value.
  const lastLabelSecRef = useRef(-1);
  const handleScrub = useCallback((ratio: number) => {
    const secs = Math.floor(ratio * totalDurationRef.current);
    if (secs === lastLabelSecRef.current) return;
    lastLabelSecRef.current = secs;
    setCurrentTime(secs);
  }, []);

  const handleSeek = useCallback(
    async (ratio: number) => {
      const clamped = clamp01(ratio);
      isSeekingRef.current = true;
      lastSeekTimeRef.current = Date.now();
      if (isPoppedOutRef.current) {
        // The corner player owns the track; it publishes the new position back.
        seekAudioPost(clamped);
        setTimeout(() => {
          isSeekingRef.current = false;
          isDraggingRef.current = false;
        }, 100);
        return;
      }
      setProgress(clamped);
      setCurrentTime(clamped * totalDurationRef.current);
      const player = playerRef.current;
      if (!player) {
        // Nothing loaded yet — remember it and apply on load rather than
        // silently dropping the gesture.
        pendingSeekRef.current = clamped;
        isSeekingRef.current = false;
        isDraggingRef.current = false;
        return;
      }
      try {
        if (player.isLoaded && player.duration > 0) {
          const seekSeconds = clamped * player.duration;
          await player.seekTo(seekSeconds);
          setCurrentTime(seekSeconds);
        }
      } catch {}
      // Release seeking flags slightly after the command resolves
      setTimeout(() => {
        isSeekingRef.current = false;
        isDraggingRef.current = false;
      }, 100);
    },
    [],
  );

  // Reads progress through a ref rather than closing over it: every one of
  // these callbacks feeds a gesture built in a useMemo, and one that changed
  // identity ten times a second would rebuild the gesture mid-drag.
  const handleScrubCancel = useCallback(() => {
    isDraggingRef.current = false;
    isSeekingRef.current = false;
    position.value = withTiming(clamp01(progressRef.current), { duration: 120, easing: Easing.linear });
  }, [position]);

  const seekBarSurface = useSeekSurface({
    position,
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeek,
    onCancel: handleScrubCancel,
    claimOnStart: true,
  });

  const artworkSurface = useSeekSurface({
    position,
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeek,
    onCancel: handleScrubCancel,
    claimOnStart: false,
  });

  const compactSurface = useSeekSurface({
    position,
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleSeek,
    onCancel: handleScrubCancel,
    claimOnStart: false,
  });

  /* Volume. expo-audio has a muted flag, but mute here stays volume 0 with
     the level remembered — un-muting a slider dragged to zero has to put a
     level back, or the icon flips and the track stays silent.
     */
  const isEffectivelyMuted = selfMuted || volume === 0;
  volumeRef.current = isEffectivelyMuted ? 0 : volume;

  const applyVolume = useCallback((level: number) => {
    if (isPoppedOutRef.current) {
      setAudioPostVolume(level);
      return;
    }
    const player = playerRef.current;
    if (player) player.volume = clamp01(level);
  }, []);

  const handleVolumeChange = useCallback((level: number) => {
    const next = clamp01(level);
    setVolume(next);
    if (next > 0) setSelfMuted(false);
    applyVolume(next);
  }, [applyVolume]);

  const handleToggleMute = useCallback(() => {
    if (!isEffectivelyMuted) {
      setSelfMuted(true);
      applyVolume(0);
      return;
    }
    setSelfMuted(false);
    const restored = volume === 0 ? 1 : volume;
    if (volume === 0) setVolume(1);
    applyVolume(restored);
  }, [isEffectivelyMuted, volume, applyVolume]);

  const handleHueChange = useCallback((h: number) => {
    setHue(h);
    setHueState(h);
  }, []);
  const handleStyleChange = useCallback((s: VisualizerStyle) => setVizStyle(s), []);

  const onInlineLayout = useCallback((e: LayoutChangeEvent) => {
    setInlineHeight(Math.round(e.nativeEvent.layout.height));
  }, []);
  const onFullLayout = useCallback((e: LayoutChangeEvent) => {
    setFullHeight(Math.round(e.nativeEvent.layout.height));
  }, []);

  if (compact) {
    return (
      <View className="rounded-xl overflow-hidden">
        <View className="px-3 py-2.5" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handlePlayPause}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="w-8 h-8 rounded-xl bg-white/10 items-center justify-center"
            >
              {shownLoading ? (
                <Icon name="Loader" size={14} color="#fff" />
              ) : (
                <Icon name={shownPlaying ? "Pause" : "Play"} size={14} color="#fff" />
              )}
            </TouchableOpacity>

            <View className="flex-1">
              <ScrubSurface surface={compactSurface}>
                <StaticWaveform seed={seed} position={position} compact hue={hue} />
              </ScrubSurface>
            </View>

            <Text
              className="text-white/50 text-[10px]"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {fmtDuration(shownPlaying ? shownTime : shownDuration)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const renderVisualizer = (height: number) => (
    <ScrubSurface surface={artworkSurface}>
      <AudioVisualizer
        style={vizStyle}
        seed={seed}
        isPlaying={shownPlaying}
        hue={hue}
        position={position}
        height={height}
      />
    </ScrubSurface>
  );

  /* Bounty stays at the top left; volume, pop-out and fullscreen sit on the
     right, matching the web card. Everything here floats over the visualizer,
     and the wrappers are `box-none` so a touch that misses a control lands on
     the artwork underneath — a sideways drag scrubs, a flick scrolls the feed.
     Both the inline card and the fullscreen modal render this from the same
     code and the same state: the sound never reloads, it is one `playerRef`
     either way. */
  const renderTopChrome = () => (
    <View pointerEvents="box-none" style={styles.topChrome}>
      {topLeftAction}
      <View pointerEvents="box-none" className="flex-row items-center gap-2 ml-auto">
        <View
          className="flex-row items-center gap-1.5 rounded-xl bg-white/10 px-2"
          style={{ height: CONTROL_SIZE, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
        >
          <TouchableOpacity
            onPress={handleToggleMute}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={isEffectivelyMuted ? t("common.unmute") : t("common.mute")}
          >
            <Icon name={isEffectivelyMuted ? "VolumeX" : "Volume2"} size={14} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <View style={{ width: 72, height: CONTROL_SIZE, justifyContent: "center" }}>
            <PagerSafe>
            <Slider
              style={{ width: "100%" }}
              minimumValue={0}
              maximumValue={1}
              step={0.01}
              value={isEffectivelyMuted ? 0 : volume}
              onValueChange={handleVolumeChange}
              minimumTrackTintColor="rgba(255,255,255,0.85)"
              maximumTrackTintColor="rgba(255,255,255,0.25)"
              thumbTintColor="#ffffff"
            />
            </PagerSafe>
          </View>
        </View>

        <TouchableOpacity
          onPress={handlePopOut}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          className="rounded-xl items-center justify-center"
          style={[styles.squareControl, isPoppedOut && styles.squareControlOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: isPoppedOut }}
          accessibilityLabel={isPoppedOut ? t("audioPost.closeCornerPlayer") : t("audioPost.popOut")}
        >
          <Icon name="PictureInPicture2" size={15} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsFullscreen((v) => !v)}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          className="rounded-xl items-center justify-center"
          style={styles.squareControl}
          accessibilityRole="button"
          accessibilityLabel={isFullscreen ? t("common.exitFullscreen") : t("common.fullscreen")}
        >
          <Icon name={isFullscreen ? "Minimize2" : "Maximize2"} size={15} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBottomChrome = () => (
    <View pointerEvents="box-none" style={styles.bottomChrome}>
      {/* Scrubber with elapsed / total, live in every style */}
      <View pointerEvents="box-none" className="flex-row items-center gap-2">
        <View style={styles.timePill}>
          <Text style={styles.timeText}>{fmtDuration(shownTime)}</Text>
        </View>
        <View className="flex-1">
          <ScrubSurface surface={seekBarSurface}>
            <SeekBar position={position} hue={hue} />
          </ScrubSurface>
        </View>
        <View style={styles.timePill}>
          <Text style={styles.timeText}>{fmtDuration(shownDuration)}</Text>
        </View>
      </View>

      {/* Play sits with the colour and animation pickers rather than alone in
          the middle of the card, so every control for the track is in one
          place along the bottom — and all three are CONTROL_SIZE tall, which
          they were not: 36 against 32 against 24 read as three sizes on a
          baseline. */}
      <View pointerEvents="box-none" className="flex-row items-center gap-2">
        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="rounded-xl items-center justify-center"
          style={styles.squareControl}
          accessibilityRole="button"
          accessibilityLabel={shownPlaying ? t("audioPost.pause") : t("audioPost.play")}
        >
          {shownLoading ? (
            <Icon name="Loader" size={16} color="#fff" />
          ) : (
            <Icon name={shownPlaying ? "Pause" : "Play"} size={16} color="#fff" />
          )}
        </TouchableOpacity>

        <HueSlider hue={hue} onHueChange={handleHueChange} />

        <View className="flex-1">
          <StylePicker style={vizStyle} onStyleChange={handleStyleChange} />
        </View>
      </View>
    </View>
  );

  /* The media window. The visualizer is the window — it fills it edge to edge
     at the measured height — and the chrome floats on top. Inline it is 16:9;
     in the fullscreen modal it is the whole screen. */
  const renderWindow = (mode: "inline" | "fullscreen") => {
    const height = mode === "inline" ? inlineHeight : fullHeight;
    return (
      <View
        style={mode === "inline" ? styles.windowInline : styles.windowFull}
        onLayout={mode === "inline" ? onInlineLayout : onFullLayout}
      >
        <View style={StyleSheet.absoluteFill}>{height > 0 && renderVisualizer(height)}</View>
        {renderTopChrome()}
        {renderBottomChrome()}
      </View>
    );
  };

  return (
    <View style={styles.card}>
      {renderWindow("inline")}

      {/* An RN <Modal>, mounted here rather than routed to: a
          `transparentModal` screen leaves what is behind it visible but not
          interactive, and this component must stay mounted or the sound
          unloads mid-track. */}
      <Modal
        visible={isFullscreen}
        animationType="fade"
        supportedOrientations={["portrait", "landscape"]}
        onRequestClose={() => setIsFullscreen(false)}
        statusBarTranslucent
      >
        <View
          style={[
            styles.fullscreenRoot,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
          {renderWindow("fullscreen")}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  windowInline: {
    width: "100%",
    aspectRatio: MEDIA_ASPECT,
    overflow: "hidden",
  },
  windowFull: {
    flex: 1,
    overflow: "hidden",
  },
  topChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  bottomChrome: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 6,
  },
  squareControl: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  squareControlOn: {
    backgroundColor: "rgba(255,255,255,0.28)",
    borderColor: "rgba(255,255,255,0.35)",
  },
  // Same pill as FeedVideoPlayer, so the times stay readable over a full waveform.
  timePill: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
    minWidth: 28,
  },
  fullscreenRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
});

const AudioPostPlayer = memo(AudioPostPlayerComponent);
export default AudioPostPlayer;
