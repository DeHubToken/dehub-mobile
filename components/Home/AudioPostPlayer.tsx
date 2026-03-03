import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
  interpolate,
} from "react-native-reanimated";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { stopActivePreview } from "../../libs/previewRegistry";
import { recordListen } from "../../services/audio.service";

/* ─── Constants ─────────────────────────────────────────────── */
const BAR_COUNT = 40;
const BAR_WIDTH = 3;
const BAR_GAP = 2;
const MAX_BAR_HEIGHT = 48;
const MIN_BAR_HEIGHT = 4;

const fmtDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/* ─── Animated bar component ────────────────────────────────── */
interface AnimatedBarProps {
  index: number;
  progress: number;
  isPlaying: boolean;
}

const AnimatedBar: React.FC<AnimatedBarProps> = memo(({ index, isPlaying }) => {
  const height = useSharedValue(MIN_BAR_HEIGHT);

  useEffect(() => {
    if (isPlaying) {
      // Each bar gets a unique base height and animation speed for organic feel
      const baseHeight = MIN_BAR_HEIGHT + ((index * 7 + 3) % (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
      const speed = 300 + (index * 47) % 400;
      const delay = (index * 31) % 200;

      height.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(baseHeight, { duration: speed, easing: Easing.inOut(Easing.sin) }),
            withTiming(
              MIN_BAR_HEIGHT + Math.random() * (MAX_BAR_HEIGHT * 0.4),
              { duration: speed * 0.8, easing: Easing.inOut(Easing.sin) }
            ),
            withTiming(
              baseHeight * 0.6 + Math.random() * (MAX_BAR_HEIGHT * 0.3),
              { duration: speed * 1.2, easing: Easing.inOut(Easing.sin) }
            ),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(MIN_BAR_HEIGHT + ((index * 5) % 12), { duration: 300 });
    }
  }, [isPlaying, index, height]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <Animated.View
      style={[
        barStyle,
        {
          width: BAR_WIDTH,
          borderRadius: BAR_WIDTH / 2,
          marginRight: BAR_GAP,
          backgroundColor: "rgba(255, 255, 255, 0.6)",
        },
      ]}
    />
  );
});

/* ─── Waveform visualizer ───────────────────────────────────── */
interface WaveformVisualizerProps {
  isPlaying: boolean;
  progress: number;
}

const WaveformVisualizer: React.FC<WaveformVisualizerProps> = memo(
  ({ isPlaying, progress }) => (
    <View
      className="flex-row items-end justify-center"
      style={{ height: MAX_BAR_HEIGHT + 4 }}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <AnimatedBar key={i} index={i} progress={progress} isPlaying={isPlaying} />
      ))}
    </View>
  ),
);

/* ─── Progress bar ──────────────────────────────────────────── */
interface ProgressBarProps {
  progress: number;
}

const ProgressBar: React.FC<ProgressBarProps> = memo(({ progress }) => (
  <View className="h-1 bg-white/10 rounded-full overflow-hidden mt-3">
    <View
      className="h-full rounded-full bg-white/60"
      style={{ width: `${Math.min(100, progress * 100)}%` }}
    />
  </View>
));

/* ═══════════════════════════════════════════════════════════════
   AudioPostPlayer — audio playback with visual animation
   ═══════════════════════════════════════════════════════════════ */
export interface AudioPostPlayerProps {
  audioUrl: string;
  duration?: number;
  tokenId: string | number;
  listens?: number;
  /** When false, pauses playback and avoids preloading */
  isVisible?: boolean;
}

const AudioPostPlayerComponent: React.FC<AudioPostPlayerProps> = ({
  audioUrl,
  duration = 0,
  tokenId,
  listens: initialListens = 0,
  isVisible = true,
}) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [listenCount, setListenCount] = useState(initialListens);
  const listenRecordedRef = useRef(false);
  const positionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocused = useIsFocused();
  const preloadedRef = useRef(false);

  // Stable callback for audio focus — pauses this player when another source claims focus
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

  // Track position with interval for smoother updates
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

  // Preload audio when visible and screen is focused
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

  // Pause playback when scrolled out of view or screen loses focus
  useEffect(() => {
    if ((!isVisible || !isFocused) && isPlaying && soundRef.current) {
      soundRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
      stopPositionTracking();
    }
  }, [isVisible, isFocused, isPlaying, stopPositionTracking]);

  // Cleanup on unmount
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

      // Claim exclusive audio focus — stops any other playing audio/video
      requestAudioFocus(focusStopRef.current);
      stopActivePreview();

      // If sound is already preloaded, just resume
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

          if (!listenRecordedRef.current) {
            listenRecordedRef.current = true;
            recordListen(String(tokenId))
              .then((res) => { if (res.listens) setListenCount(res.listens); })
              .catch(() => {});
          }
          return;
        }
      }

      // Fallback: load and play (if preload failed)
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

      if (!listenRecordedRef.current) {
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
  }, [isPlaying, audioUrl, tokenId, startPositionTracking, stopPositionTracking]);

  return (
    <View className="mt-3 rounded-2xl overflow-hidden">
      <LinearGradient
        colors={["#1a1a2e", "#16213e", "#0f3460"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="p-4"
      >
        {/* Ambient glow behind visualizer */}
        <Animated.View
          style={glowStyle}
          className="absolute inset-0 items-center justify-center"
        >
          <View className="w-40 h-40 rounded-full bg-purple-500/20" />
        </Animated.View>

        {/* Waveform visualizer */}
        <WaveformVisualizer isPlaying={isPlaying} progress={progress} />

        {/* Progress bar */}
        <ProgressBar progress={progress} />

        {/* Controls row */}
        <View className="flex-row items-center justify-between mt-3">
          <Text
            className="text-white/60 text-xs"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {fmtDuration(currentTime)}
          </Text>

          {/* Play / Pause button */}
          <TouchableOpacity
            onPress={handlePlayPause}
            activeOpacity={0.7}
            className="w-12 h-12 rounded-full bg-white/20 items-center justify-center"
          >
            {isLoading ? (
              <Ionicons name="hourglass-outline" size={22} color="#fff" />
            ) : (
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={24}
                color="#fff"
                style={isPlaying ? undefined : { marginLeft: 2 }}
              />
            )}
          </TouchableOpacity>

          <Text
            className="text-white/60 text-xs"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {fmtDuration(totalDuration)}
          </Text>
        </View>

        {/* Listen count */}
        <View className="flex-row items-center justify-center mt-2 gap-1">
          <Ionicons name="headset-outline" size={12} color="rgba(255,255,255,0.4)" />
          <Text className="text-white/40 text-[10px]">
            {listenCount} {listenCount === 1 ? "listen" : "listens"}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const AudioPostPlayer = memo(AudioPostPlayerComponent);
export default AudioPostPlayer;
