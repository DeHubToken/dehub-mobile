import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  Dimensions,
  LayoutChangeEvent,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  GestureResponderHandlers,
} from "react-native";
import Slider from "@react-native-community/slider";
import { getCachedHue, setHueState } from "../../libs/audioHueState";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
  SharedValue,
} from "react-native-reanimated";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { stopActivePreview } from "../../libs/previewRegistry";
import { recordListen } from "../../services/audio.service";

/* ─── Constants ─────────────────────────────────────────────── */
const BAR_COUNT = 80;
const BAR_WIDTH = 2.5;
const BAR_GAP = 1.5;
const WAVEFORM_HEIGHT = 60;

const COMPACT_BAR_COUNT = 40;
const COMPACT_BAR_WIDTH = 2;
const COMPACT_BAR_GAP = 1;
const COMPACT_WAVEFORM_HEIGHT = 28;

// Matches FeedVideoPlayer's AUTOPLAY_DELAY: how long a card must stay visible
// before it is treated as scrolled-to rather than scrolled-past.
const PRELOAD_SETTLE_MS = 400;

/** Horizontal travel before a drag over the artwork counts as a scrub. */
const SCRUB_THRESHOLD_PX = 6;

/** One height for every control, so the row reads as a row. */
const CONTROL_SIZE = 32;

type VisualizerStyle = "static" | "bars" | "wave" | "mirror";

const VISUALIZER_STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: "static", label: "Default" },
  { value: "bars", label: "Bars" },
  { value: "wave", label: "Wave" },
  { value: "mirror", label: "Mirror" },
];

const fmtDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/* ─── Seeded PRNG (mulberry32) ──────────────────────────────── */
const seedRandom = (str: string) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return () => {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const generateBars = (seed: string, count: number): number[] => {
  const rand = seedRandom(seed);
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const envelope = 0.3 + 0.7 * Math.sin(t * Math.PI);
    const noise = 0.4 + 0.6 * rand();
    bars.push(envelope * noise);
  }
  return bars;
};

/* ─── Seek gestures ──────────────────────────────────────────────────────
   Two kinds of surface want to scrub, and they must not behave the same way.

   The slim bar under the artwork is a deliberate target, so it claims the
   touch immediately: tap to jump, drag to scrub.

   The artwork itself is 60px of the card, sitting in a vertically scrolling
   feed. It used to claim every touch that started on it, which meant a finger
   landing on an audio post could not scroll the feed at all — so it now only
   takes over once a gesture is clearly sideways, and a vertical flick passes
   straight through to the list. */
interface SeekSurfaceArgs {
  position: SharedValue<number>;
  onScrubStart: () => void;
  onScrub: (ratio: number) => void;
  onCommit: (ratio: number) => void;
  onCancel: () => void;
  claimOnStart: boolean;
  enabled?: boolean;
}

const useSeekSurface = ({
  position,
  onScrubStart,
  onScrub,
  onCommit,
  onCancel,
  claimOnStart,
  enabled = true,
}: SeekSurfaceArgs) => {
  const widthRef = useRef(1);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width || 1;
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => enabled && claimOnStart,
        onMoveShouldSetPanResponder: (_e: GestureResponderEvent, gs: PanResponderGestureState) => {
          if (!enabled) return false;
          if (claimOnStart) return true;
          return Math.abs(gs.dx) > SCRUB_THRESHOLD_PX && Math.abs(gs.dx) > Math.abs(gs.dy);
        },
        onPanResponderGrant: (e) => {
          onScrubStart();
          const p = clamp01(e.nativeEvent.locationX / widthRef.current);
          position.value = p;
          onScrub(p);
        },
        onPanResponderMove: (e) => {
          const p = clamp01(e.nativeEvent.locationX / widthRef.current);
          position.value = p; // UI thread, no React re-render per pixel
          onScrub(p);
        },
        onPanResponderRelease: (e) => {
          const p = clamp01(e.nativeEvent.locationX / widthRef.current);
          position.value = p;
          onCommit(p);
        },
        onPanResponderTerminate: onCancel,
        onPanResponderTerminationRequest: () => true,
      }),
    [enabled, claimOnStart, position, onScrubStart, onScrub, onCommit, onCancel],
  );

  return { onLayout, panHandlers: enabled ? panResponder.panHandlers : {} };
};

/* ─── Static waveform (plain Views, no worklets) ────────────── */
/* ─── WaveformBars — memo'd bar row, never re-renders on seek ── */
interface WaveformBarsProps {
  bars: number[];
  wHeight: number;
  bw: number;
  bg: number;
  count: number;
  color: string;
}

const WaveformBars: React.FC<WaveformBarsProps> = memo(
  ({ bars, wHeight, bw, bg, count, color }) => (
    <View style={{ flexDirection: "row", alignItems: "center", height: wHeight }}>
      {bars.map((h, i) => (
        <View
          key={i}
          style={{
            width: bw,
            height: Math.max(2, h * wHeight * 0.85),
            borderRadius: bw / 2,
            marginRight: i < count - 1 ? bg : 0,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  ),
);

/* ─── SeekBar — the scrubber, live in every visualizer style ────
   The old build painted a 3px progress line that could only be watched: there
   was no way to move through a track at all, and the animated styles did not
   even show where you were. */
interface SeekBarProps {
  position: SharedValue<number>;
  hue: number;
  onLayout: (e: LayoutChangeEvent) => void;
  panHandlers: Partial<GestureResponderHandlers>;
}

const SeekBar: React.FC<SeekBarProps> = memo(({ position, hue, onLayout, panHandlers }) => {
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
      onLayout={onLayout}
      {...panHandlers}
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

interface StaticWaveformProps {
  seed: string;
  position: SharedValue<number>;
  compact?: boolean;
  hue: number;
  /** Overrides the band height so fullscreen renders the same waveform big. */
  height?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  panHandlers?: Partial<GestureResponderHandlers>;
}

const StaticWaveform: React.FC<StaticWaveformProps> = memo(
  ({ seed, position, compact, hue, height, onLayout, panHandlers }) => {
    const count = compact ? COMPACT_BAR_COUNT : BAR_COUNT;
    const bw = compact ? COMPACT_BAR_WIDTH : BAR_WIDTH;
    const bg = compact ? COMPACT_BAR_GAP : BAR_GAP;
    const wHeight = height ?? (compact ? COMPACT_WAVEFORM_HEIGHT : WAVEFORM_HEIGHT);
    const bars = useMemo(() => generateBars(seed, count), [seed, count]);

    const playedColor = hue === 0 ? "rgba(255,255,255,0.85)" : `hsla(${hue}, 80%, 70%, 0.9)`;
    const unplayedColor = "rgba(255,255,255,0.15)";

    const playedLayerStyle = useAnimatedStyle(() => ({
      position: "absolute",
      left: 0, top: 0, bottom: 0,
      width: `${position.value * 100}%`,
      overflow: "hidden",
    }));

    return (
      <View onLayout={onLayout} {...(panHandlers || {})} style={{ height: wHeight }}>
        {/* Unplayed layer — static, never re-renders during seek */}
        <WaveformBars
          bars={bars} wHeight={wHeight} bw={bw} bg={bg}
          count={count} color={unplayedColor}
        />
        {/* Played layer — only clip width changes, bars never re-render */}
        <Animated.View style={playedLayerStyle}>
          <WaveformBars
            bars={bars} wHeight={wHeight} bw={bw} bg={bg}
            count={count} color={playedColor}
          />
        </Animated.View>
      </View>
    );
  },
);

/* ─── Animated bar (for Bars / Wave / Mirror styles) ────────── */
interface AnimBarProps {
  index: number;
  isPlaying: boolean;
  baseHeight: number;
  maxH: number;
  minH: number;
  barWidth: number;
  barGap: number;
  barCount: number;
  hue: number;
  mode: "bars" | "wave" | "mirror";
}

const AnimBar: React.FC<AnimBarProps> = memo(
  ({ index, isPlaying, baseHeight, maxH, minH, barWidth, barGap, barCount, hue, mode }) => {
    const height = useSharedValue(baseHeight);

    useEffect(() => {
      if (isPlaying) {
        const speed = 250 + ((index * 47) % 350);
        const delay = (index * 23) % 180;
        const peak = minH + baseHeight * (maxH / minH) * 0.6;

        height.value = withDelay(
          delay,
          withRepeat(
            withSequence(
              withTiming(Math.min(peak, maxH), {
                duration: speed,
                easing: Easing.inOut(Easing.sin),
              }),
              withTiming(minH + baseHeight * 0.3, {
                duration: speed * 0.7,
                easing: Easing.inOut(Easing.sin),
              }),
            ),
            -1,
            true,
          ),
        );
      } else {
        cancelAnimation(height);
        height.value = withTiming(baseHeight, { duration: 300 });
      }
    }, [isPlaying, index, height, minH, maxH, baseHeight]);

    const barStyle = useAnimatedStyle(() => ({ height: height.value }));

    const color =
      hue === 0
        ? "rgba(255,255,255,0.55)"
        : `hsla(${(hue + index * 2) % 360}, 75%, 65%, 0.7)`;

    if (mode === "mirror") {
      return (
        <View
          style={{
            width: barWidth,
            marginRight: index < barCount - 1 ? barGap : 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Animated.View
            style={[barStyle, { width: barWidth, borderRadius: barWidth / 2, backgroundColor: color }]}
          />
          <View style={{ height: 2 }} />
          <Animated.View
            style={[barStyle, { width: barWidth, borderRadius: barWidth / 2, backgroundColor: color, opacity: 0.4 }]}
          />
        </View>
      );
    }

    return (
      <Animated.View
        style={[
          barStyle,
          {
            width: barWidth,
            borderRadius: barWidth / 2,
            marginRight: index < barCount - 1 ? barGap : 0,
            backgroundColor: color,
          },
        ]}
      />
    );
  },
);

/* ─── Animated visualizer (Bars / Wave / Mirror) ────────────── */
interface AnimatedVisualizerProps {
  seed: string;
  isPlaying: boolean;
  hue: number;
  mode: "bars" | "wave" | "mirror";
  /** Overrides the band height so fullscreen renders the same bars big. */
  height?: number;
  onLayout?: (e: LayoutChangeEvent) => void;
  panHandlers?: Partial<GestureResponderHandlers>;
}

const AnimatedVisualizer: React.FC<AnimatedVisualizerProps> = memo(
  ({ seed, isPlaying, hue, mode, height, onLayout, panHandlers }) => {
    const count = BAR_COUNT;
    const bw = BAR_WIDTH;
    const bg = BAR_GAP;
    const wHeight = height ?? WAVEFORM_HEIGHT;
    const maxH = mode === "mirror" ? wHeight / 2 - 2 : wHeight;
    const minH = 3;
    const bars = useMemo(() => generateBars(seed, count), [seed, count]);

    return (
      <View
        onLayout={onLayout}
        {...(panHandlers || {})}
        style={{
          flexDirection: "row",
          alignItems: mode === "mirror" ? "center" : "flex-end",
          height: wHeight,
          justifyContent: "center",
        }}
      >
        {bars.map((h, i) => (
          <AnimBar
            key={i}
            index={i}
            isPlaying={isPlaying}
            baseHeight={Math.max(minH, h * maxH * 0.7)}
            maxH={maxH}
            minH={minH}
            barWidth={bw}
            barGap={bg}
            barCount={count}
            hue={hue}
            mode={mode}
          />
        ))}
      </View>
    );
  },
);

/* ─── Style Picker Pill ─────────────────────────────────────── */
interface StylePickerProps {
  style: VisualizerStyle;
  onStyleChange: (s: VisualizerStyle) => void;
}

const StylePicker: React.FC<StylePickerProps> = memo(({ style: activeStyle, onStyleChange }) => (
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
    </View>
  );
});

export interface AudioPostPlayerProps {
  audioUrl: string;
  duration?: number;
  tokenId: string | number;
  listens?: number;
  isVisible?: boolean;
  compact?: boolean;
  isSignedIn?: boolean;
}

const AudioPostPlayerComponent: React.FC<AudioPostPlayerProps> = ({
  audioUrl,
  duration = 0,
  tokenId,
  listens: initialListens = 0,
  isVisible = true,
  compact = false,
  isSignedIn = false,
}) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [listenCount, setListenCount] = useState(initialListens);
  const [hue, setHue] = useState(() => getCachedHue());
  const [vizStyle, setVizStyle] = useState<VisualizerStyle>("static");
  const [volume, setVolume] = useState(1);
  const [selfMuted, setSelfMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const totalDurationRef = useRef(duration);
  totalDurationRef.current = totalDuration;
  const progressRef = useRef(0);
  progressRef.current = progress;
  // Read at sound-creation time, so a level set before the track loaded is not
  // lost the moment it does.
  const volumeRef = useRef(1);

  const focusStopRef = useRef(() => {
    soundRef.current?.pauseAsync().catch(() => {});
    setIsPlaying(false);
    stopPositionTracking();
    releaseAudioFocus(focusStopRef.current);
  });

  useEffect(() => {
    if (isDraggingRef.current) return;
    position.value = withTiming(clamp01(progress), { duration: 100, easing: Easing.linear });
  }, [progress, position]);

  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) return;
    positionIntervalRef.current = setInterval(async () => {
      // Suppress stale position reads during seek or right after
      if (isSeekingRef.current || Date.now() - lastSeekTimeRef.current < 600) return;
      try {
        const sound = soundRef.current;
        if (!sound) return;
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          const pos = status.positionMillis / 1000;
          const dur = (status.durationMillis || duration * 1000) / 1000;
          setCurrentTime(pos);
          if (dur > 0) {
            setProgress(pos / dur);
            setTotalDuration(dur);
          }
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
  const applyPendingSeek = useCallback(async (sound: Audio.Sound) => {
    const pending = pendingSeekRef.current;
    if (pending === null) return;
    pendingSeekRef.current = null;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        await sound.setPositionAsync(pending * status.durationMillis);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isVisible || !isFocused || preloadedRef.current) return;
    let cancelled = false;
    // Same settle grace the video cards use: becoming 50% visible mid-fling
    // used to start a download (and reconfigure the global audio session) for
    // every audio card the viewport passed over. Only a card the scroll
    // actually stopped on is worth preloading. The audio mode is set at play
    // time now — preloading with shouldPlay: false doesn't need the session.
    const settleTimer = setTimeout(async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 100 },
        );
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        sound.setVolumeAsync(volumeRef.current).catch(() => {});
        preloadedRef.current = true;

        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          if (status.didJustFinish) {
            setIsPlaying(false);
            setProgress(1);
            stopPositionTracking();
            releaseAudioFocus(focusStopRef.current);
          }
        });

        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setTotalDuration(status.durationMillis / 1000);
        }
        await applyPendingSeek(sound);
      } catch (e) {
        // Preload failed — will load on play tap
      }
    }, PRELOAD_SETTLE_MS);
    return () => { cancelled = true; clearTimeout(settleTimer); };
  }, [isVisible, isFocused, audioUrl, stopPositionTracking, applyPendingSeek]);

  useEffect(() => {
    if ((!isVisible || !isFocused) && isPlaying && soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
      stopPositionTracking();
    }
  }, [isVisible, isFocused, isPlaying, stopPositionTracking]);

  useEffect(() => {
    const stopFn = focusStopRef.current;
    return () => {
      stopPositionTracking();
      releaseAudioFocus(stopFn);
      const sound = soundRef.current;
      if (sound) {
        sound.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, [stopPositionTracking]);

  const handlePlayPause = useCallback(async () => {
    try {
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        stopPositionTracking();
        releaseAudioFocus(focusStopRef.current);
        return;
      }

      requestAudioFocus(focusStopRef.current);
      stopActivePreview();

      // Moved here from the preload path: silent-switch playback and ducking
      // are only needed once something actually plays, and setting the global
      // session per scrolled-past card was main-thread work mid-fling.
      //
      // staysActiveInBackground is true because this branch only runs on a
      // deliberate press of play. An audio post is the one thing on the feed
      // you obviously want to keep hearing with the screen off — stopping it
      // at lock was never a decision, it was the default nobody revisited.
      //
      // Muted video cards do not inherit this. The session category is global
      // to the process and the last writer wins, but FeedVideoPlayer stops
      // itself whenever AppState leaves "active", so a preview cannot ride a
      // background-capable session out of the foreground.
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        staysActiveInBackground: true,
      });

      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
          await applyPendingSeek(soundRef.current);
          if (status.didJustFinish || status.positionMillis >= (status.durationMillis || 0)) {
            await soundRef.current.setPositionAsync(0);
            listenRecordedRef.current = false;
          }
          await soundRef.current.playAsync();
          setIsPlaying(true);
          startPositionTracking();

          if (!listenRecordedRef.current && isSignedIn) {
            listenRecordedRef.current = true;
            recordListen(String(tokenId))
              .then((res) => { if (res.listens) setListenCount(res.listens); })
              .catch(() => {});
          }
          return;
        }
      }

      setIsLoading(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 100 },
      );
      soundRef.current = sound;
      sound.setVolumeAsync(volumeRef.current).catch(() => {});
      preloadedRef.current = true;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          setProgress(1);
          stopPositionTracking();
          releaseAudioFocus(focusStopRef.current);
        }
      });

      await applyPendingSeek(sound);

      setIsPlaying(true);
      setIsLoading(false);
      startPositionTracking();

      if (!listenRecordedRef.current && isSignedIn) {
        listenRecordedRef.current = true;
        recordListen(String(tokenId))
          .then((res) => { if (res.listens) setListenCount(res.listens); })
          .catch(() => {});
      }
    } catch (e) {
      console.error("[AudioPostPlayer] playback error", e);
      setIsLoading(false);
      releaseAudioFocus(focusStopRef.current);
    }
  }, [isPlaying, audioUrl, tokenId, isSignedIn, startPositionTracking, stopPositionTracking, applyPendingSeek]);

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
      setProgress(clamped);
      setCurrentTime(clamped * totalDurationRef.current);
      const sound = soundRef.current;
      if (!sound) {
        // Nothing loaded yet — remember it and apply on load rather than
        // silently dropping the gesture.
        pendingSeekRef.current = clamped;
        isSeekingRef.current = false;
        isDraggingRef.current = false;
        return;
      }
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          const seekMs = clamped * status.durationMillis;
          await sound.setPositionAsync(seekMs);
          setCurrentTime(seekMs / 1000);
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
  // these callbacks feeds a PanResponder built in a useMemo, and one that
  // changed identity ten times a second would rebuild the responder mid-drag.
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

  /* Volume. expo-av carries no muted flag, so mute is volume 0 with the level
     remembered — and un-muting a slider dragged to zero has to put a level
     back, or the icon flips and the track stays silent. */
  const isEffectivelyMuted = selfMuted || volume === 0;
  volumeRef.current = isEffectivelyMuted ? 0 : volume;

  const applyVolume = useCallback((level: number) => {
    soundRef.current?.setVolumeAsync(clamp01(level)).catch(() => {});
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

  // The screen is 100% of the modal, and the controls under it need room.
  const fullscreenWaveHeight = Math.round(Dimensions.get("window").height * 0.32);

  const handleHueChange = useCallback((h: number) => {
    setHue(h);
    setHueState(h);
  }, []);
  const handleStyleChange = useCallback((s: VisualizerStyle) => setVizStyle(s), []);

  const seed = String(tokenId);

  if (compact) {
    return (
      <View className="rounded-xl overflow-hidden">
        <View className="px-3 py-2.5" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handlePlayPause}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
            >
              {isLoading ? (
                <Icon name="Loader" size={14} color="#fff" />
              ) : (
                <Icon name={isPlaying ? "Pause" : "Play"} size={14} color="#fff" />
              )}
            </TouchableOpacity>

            <View className="flex-1">
              <StaticWaveform
                seed={seed}
                position={position}
                compact
                hue={hue}
                onLayout={compactSurface.onLayout}
                panHandlers={compactSurface.panHandlers}
              />
            </View>

            <Text
              className="text-white/50 text-[10px]"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {fmtDuration(isPlaying ? currentTime : totalDuration)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const renderVisualizer = (height?: number) => {
    if (vizStyle === "static") {
      return (
        <StaticWaveform
          seed={seed}
          position={position}
          hue={hue}
          height={height}
          onLayout={artworkSurface.onLayout}
          panHandlers={artworkSurface.panHandlers}
        />
      );
    }
    return (
      <AnimatedVisualizer
        seed={seed}
        isPlaying={isPlaying}
        hue={hue}
        mode={vizStyle}
        height={height}
        onLayout={artworkSurface.onLayout}
        panHandlers={artworkSurface.panHandlers}
      />
    );
  };

  /* Volume and fullscreen ride the top corners of the artwork, matching the
     web card. Both are rendered by `renderBody`, so the fullscreen modal gets
     them from the same code and the same state — the sound never reloads, it
     is one `soundRef` either way. */
  const renderTopChrome = () => (
    <View className="flex-row items-center justify-between mb-2">
      <View
        className="flex-row items-center gap-1.5 rounded-xl bg-white/10 px-2"
        style={{ height: CONTROL_SIZE, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
      >
        <TouchableOpacity
          onPress={handleToggleMute}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
        >
          <Icon name={isEffectivelyMuted ? "VolumeX" : "Volume2"} size={14} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
        <View style={{ width: 72, height: CONTROL_SIZE, justifyContent: "center" }}>
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
        </View>
      </View>

      <TouchableOpacity
        onPress={() => setIsFullscreen((v) => !v)}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        className="rounded-xl bg-white/10 items-center justify-center"
        style={{ width: CONTROL_SIZE, height: CONTROL_SIZE, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
      >
        <Icon name={isFullscreen ? "Minimize2" : "Maximize2"} size={15} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderBody = (visualizerHeight?: number) => (
    <>
      {renderTopChrome()}
      {renderVisualizer(visualizerHeight)}

      {/* Scrubber with elapsed / total, live in every style */}
      <View className="flex-row items-center gap-2 mt-2">
        <Text
          className="text-white/60 text-[11px]"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {fmtDuration(currentTime)}
        </Text>
        <View className="flex-1">
          <SeekBar
            position={position}
            hue={hue}
            onLayout={seekBarSurface.onLayout}
            panHandlers={seekBarSurface.panHandlers}
          />
        </View>
        <Text
          className="text-white/40 text-[11px]"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {fmtDuration(totalDuration)}
        </Text>
      </View>

      {/* Play sits with the colour and animation pickers rather than alone in
          the middle of the card, so every control for the track is in one
          place along the bottom — and all three are CONTROL_SIZE tall, which
          they were not: 36 against 32 against 24 read as three sizes on a
          baseline. */}
      <View className="flex-row items-center gap-2 mt-2">
        <TouchableOpacity
          onPress={handlePlayPause}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="rounded-xl bg-white/10 items-center justify-center"
          style={{ width: CONTROL_SIZE, height: CONTROL_SIZE, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
        >
          {isLoading ? (
            <Icon name="Loader" size={16} color="#fff" />
          ) : (
            <Icon name={isPlaying ? "Pause" : "Play"} size={16} color="#fff" />
          )}
        </TouchableOpacity>

        <HueSlider hue={hue} onHueChange={handleHueChange} />

        <View className="flex-1">
          <StylePicker style={vizStyle} onStyleChange={handleStyleChange} />
        </View>
      </View>

      <View className="flex-row items-center justify-end gap-1 mt-2">
        <Icon name="Headphones" size={11} color="rgba(255,255,255,0.35)" />
        <Text className="text-white/35 text-[10px]">
          {listenCount} {listenCount === 1 ? "listen" : "listens"}
        </Text>
      </View>
    </>
  );

  return (
    <View className="mt-3 rounded-xl overflow-hidden">
      <View className="p-4" style={{ backgroundColor: "rgba(0,0,0,0.65)" }}>
        {renderBody()}
      </View>

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
        <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", paddingHorizontal: 16 }}>
          {renderBody(fullscreenWaveHeight)}
        </View>
      </Modal>
    </View>
  );
};

const AudioPostPlayer = memo(AudioPostPlayerComponent);
export default AudioPostPlayer;
