import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, Pressable, LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
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

type VisualizerStyle = "static" | "bars" | "wave" | "mirror";

const VISUALIZER_STYLES: { value: VisualizerStyle; label: string }[] = [
  { value: "static", label: "Default" },
  { value: "bars", label: "Bars" },
  { value: "wave", label: "Wave" },
  { value: "mirror", label: "Mirror" },
];

const fmtDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

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

/* ─── Static waveform (plain Views, no worklets) ────────────── */
interface StaticWaveformProps {
  seed: string;
  progress: number;
  compact?: boolean;
  hue: number;
  onSeek?: (position: number) => void;
}

const StaticWaveform: React.FC<StaticWaveformProps> = memo(
  ({ seed, progress, compact, hue, onSeek }) => {
    const count = compact ? COMPACT_BAR_COUNT : BAR_COUNT;
    const bw = compact ? COMPACT_BAR_WIDTH : BAR_WIDTH;
    const bg = compact ? COMPACT_BAR_GAP : BAR_GAP;
    const wHeight = compact ? COMPACT_WAVEFORM_HEIGHT : WAVEFORM_HEIGHT;
    const bars = useMemo(() => generateBars(seed, count), [seed, count]);

    const playedColor = hue === 0 ? "rgba(255,255,255,0.85)" : `hsla(${hue}, 80%, 70%, 0.9)`;
    const unplayedColor = "rgba(255,255,255,0.15)";

    const layoutW = useRef(1);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      layoutW.current = e.nativeEvent.layout.width;
    }, []);

    const handlePress = useCallback(
      (e: { nativeEvent: { locationX: number } }) => {
        if (!onSeek) return;
        const pos = Math.max(0, Math.min(1, e.nativeEvent.locationX / layoutW.current));
        onSeek(pos);
      },
      [onSeek],
    );

    return (
      <Pressable
        onLayout={handleLayout}
        onPress={handlePress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          height: wHeight,
          justifyContent: "center",
        }}
      >
        {bars.map((h, i) => {
          const barH = Math.max(2, h * wHeight * 0.85);
          const threshold = (i + 0.5) / count;
          const played = progress >= threshold;
          return (
            <View
              key={i}
              style={{
                width: bw,
                height: barH,
                borderRadius: bw / 2,
                marginRight: i < count - 1 ? bg : 0,
                backgroundColor: played ? playedColor : unplayedColor,
              }}
            />
          );
        })}
      </Pressable>
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
}

const AnimatedVisualizer: React.FC<AnimatedVisualizerProps> = memo(
  ({ seed, isPlaying, hue, mode }) => {
    const count = BAR_COUNT;
    const bw = BAR_WIDTH;
    const bg = BAR_GAP;
    const maxH = mode === "mirror" ? WAVEFORM_HEIGHT / 2 - 2 : WAVEFORM_HEIGHT;
    const minH = 3;
    const bars = useMemo(() => generateBars(seed, count), [seed, count]);

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: mode === "mirror" ? "center" : "flex-end",
          height: WAVEFORM_HEIGHT,
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
  <View style={{ flexDirection: "row", gap: 4 }}>
    {VISUALIZER_STYLES.map((s) => {
      const isActive = activeStyle === s.value;
      return (
        <Pressable
          key={s.value}
          onPress={() => onStyleChange(s.value)}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
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
  </View>
));

/* ─── Color Hue Picker ──────────────────────────────────────── */
const HUE_PRESETS = [0, 30, 60, 120, 180, 210, 260, 300, 340];

interface HuePickerProps {
  hue: number;
  onHueChange: (h: number) => void;
}

const HuePicker: React.FC<HuePickerProps> = memo(({ hue, onHueChange }) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
    {HUE_PRESETS.map((h) => {
      const isActive = hue === h;
      const bg = h === 0 ? "rgba(255,255,255,0.85)" : `hsl(${h}, 80%, 65%)`;
      return (
        <Pressable
          key={h}
          onPress={() => onHueChange(h)}
          style={{
            width: isActive ? 18 : 14,
            height: isActive ? 18 : 14,
            borderRadius: 9,
            backgroundColor: bg,
            borderWidth: isActive ? 2 : 0,
            borderColor: "rgba(255,255,255,0.6)",
          }}
        />
      );
    })}
  </View>
));

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
  const [hue, setHue] = useState(0);
  const [vizStyle, setVizStyle] = useState<VisualizerStyle>("static");
  const listenRecordedRef = useRef(false);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useIsFocused();
  const preloadedRef = useRef(false);

  const focusStopRef = useRef(() => {
    soundRef.current?.pauseAsync().catch(() => {});
    setIsPlaying(false);
    stopPositionTracking();
    releaseAudioFocus(focusStopRef.current);
  });

  // Glow animation
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isPlaying) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.3, { duration: 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(glowOpacity);
      glowOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [isPlaying, glowOpacity]);

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));

  const startPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) return;
    positionIntervalRef.current = setInterval(async () => {
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
    }, 250);
  }, [duration]);

  const stopPositionTracking = useCallback(() => {
    if (positionIntervalRef.current) {
      clearInterval(positionIntervalRef.current);
      positionIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isVisible || !isFocused || preloadedRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DuckOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 250 },
        );
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
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
      } catch (e) {
        // Preload failed — will load on play tap
      }
    })();
    return () => { cancelled = true; };
  }, [isVisible, isFocused, audioUrl, stopPositionTracking]);

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

      if (soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded) {
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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true, progressUpdateIntervalMillis: 250 },
      );
      soundRef.current = sound;
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
  }, [isPlaying, audioUrl, tokenId, isSignedIn, startPositionTracking, stopPositionTracking]);

  const handleSeek = useCallback(
    async (position: number) => {
      const sound = soundRef.current;
      if (!sound) return;
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          const seekMs = position * status.durationMillis;
          await sound.setPositionAsync(seekMs);
          setProgress(position);
          setCurrentTime(seekMs / 1000);
        }
      } catch {}
    },
    [],
  );

  const handleHueChange = useCallback((h: number) => setHue(h), []);
  const handleStyleChange = useCallback((s: VisualizerStyle) => setVizStyle(s), []);

  const seed = String(tokenId);

  if (compact) {
    return (
      <View className="rounded-xl overflow-hidden">
        <LinearGradient
          colors={["#0a0a0c", "#111318", "#0f1520"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="px-3 py-2.5"
        >
          <View className="flex-row items-center gap-2.5">
            <TouchableOpacity
              onPress={handlePlayPause}
              activeOpacity={0.7}
              className="w-8 h-8 rounded-full bg-white/10 items-center justify-center"
            >
              {isLoading ? (
                <Icon name="Loader" size={14} color="#fff" />
              ) : (
                <Icon name={isPlaying ? "Pause" : "Play"} size={14} color="#fff" />
              )}
            </TouchableOpacity>

            <View className="flex-1">
              <StaticWaveform seed={seed} progress={progress} compact hue={hue} />
            </View>

            <Text
              className="text-white/50 text-[10px]"
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {fmtDuration(isPlaying ? currentTime : totalDuration)}
            </Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  const renderVisualizer = () => {
    if (vizStyle === "static") {
      return (
        <StaticWaveform
          seed={seed}
          progress={progress}
          hue={hue}
          onSeek={handleSeek}
        />
      );
    }
    return (
      <AnimatedVisualizer
        seed={seed}
        isPlaying={isPlaying}
        hue={hue}
        mode={vizStyle}
      />
    );
  };

  return (
    <View className="mt-3 rounded-2xl overflow-hidden">
      <LinearGradient
        colors={["#0a0a0c", "#111318", "#0f1520"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="p-4"
      >
        <Animated.View
          style={glowStyle}
          className="absolute inset-0 items-center justify-center"
        >
          <View
            className="w-40 h-40 rounded-full"
            style={{
              backgroundColor:
                hue === 0
                  ? "rgba(255,255,255,0.06)"
                  : `hsla(${hue}, 70%, 50%, 0.12)`,
            }}
          />
        </Animated.View>

        {renderVisualizer()}

        <View className="h-[3px] bg-white/10 rounded-full overflow-hidden mt-3">
          <View
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, progress * 100)}%`,
              backgroundColor:
                hue === 0
                  ? "rgba(255,255,255,0.6)"
                  : `hsla(${hue}, 80%, 65%, 0.8)`,
            }}
          />
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <Text
            className="text-white/50 text-xs"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {fmtDuration(currentTime)}
          </Text>

          <TouchableOpacity
            onPress={handlePlayPause}
            activeOpacity={0.7}
            className="w-11 h-11 rounded-xl bg-white/10 items-center justify-center"
            style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" }}
          >
            {isLoading ? (
              <Icon name="Loader" size={20} color="#fff" />
            ) : (
              <Icon name={isPlaying ? "Pause" : "Play"} size={20} color="#fff" />
            )}
          </TouchableOpacity>

          <Text
            className="text-white/50 text-xs"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {fmtDuration(totalDuration)}
          </Text>
        </View>

        <View className="flex-row items-center justify-between mt-3">
          <StylePicker style={vizStyle} onStyleChange={handleStyleChange} />

          <View className="flex-row items-center gap-1">
            <Icon name="Headphones" size={11} color="rgba(255,255,255,0.35)" />
            <Text className="text-white/35 text-[10px]">
              {listenCount} {listenCount === 1 ? "listen" : "listens"}
            </Text>
          </View>
        </View>

        <View className="mt-2.5">
          <HuePicker hue={hue} onHueChange={handleHueChange} />
        </View>
      </LinearGradient>
    </View>
  );
};

const AudioPostPlayer = memo(AudioPostPlayerComponent);
export default AudioPostPlayer;
