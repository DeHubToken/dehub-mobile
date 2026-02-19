/**
 * VoiceNotePlayer — WhatsApp-style voice note waveform player.
 *
 * Shows a play/pause button, animated waveform bars, elapsed / total time,
 * and a progress scrubber. Uses expo-av for playback.
 */
import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Audio, AVPlaybackStatus } from "expo-av";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

const BAR_COUNT = 28;
const BAR_WIDTH = 3;
const BAR_GAP = 1.5;
const MAX_BAR_HEIGHT = 22;
const MIN_BAR_HEIGHT = 3;

/** Generate deterministic pseudo-random waveform heights from a seed (URL hash). */
const generateWaveform = (seed: string): number[] => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    h = ((h * 16807) + 12345) & 0x7fffffff;
    const normalized = (h % 100) / 100;
    bars.push(MIN_BAR_HEIGHT + normalized * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
  }
  return bars;
};

/** Format seconds → m:ss */
const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

interface VoiceNotePlayerProps {
  /** Fully-resolved audio URL (CDN) */
  audioUrl: string;
  /** Duration in seconds (from API). Fallback: detected on load. */
  duration?: number;
  /** Compact mode for inline comment display */
  compact?: boolean;
}

const VoiceNotePlayerComponent: React.FC<VoiceNotePlayerProps> = ({
  audioUrl,
  duration: durationProp,
  compact = false,
}) => {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState((durationProp ?? 0) * 1000);
  const progress = useSharedValue(0);

  const waveform = useMemo(() => generateWaveform(audioUrl), [audioUrl]);

  const onPlaybackStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      setPositionMs(status.positionMillis);
      if (status.durationMillis) setDurationMs(status.durationMillis);
      const dur = status.durationMillis || durationMs || 1;
      progress.value = withTiming(status.positionMillis / dur, { duration: 250 });
      if (status.didJustFinish) {
        setIsPlaying(false);
        progress.value = withTiming(0, { duration: 300 });
        setPositionMs(0);
      }
    },
    [durationMs, progress]
  );

  // Preload audio on mount so playback is instant
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false },
          onPlaybackStatus
        );
        if (cancelled) {
          sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
        const status = await sound.getStatusAsync();
        if (status.isLoaded && status.durationMillis) {
          setDurationMs(status.durationMillis);
        }
      } catch (e) {
        // Preload failed — will load on play tap instead
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audioUrl, onPlaybackStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const loadAndPlay = useCallback(async () => {
    try {
      setIsLoading(true);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        onPlaybackStatus
      );
      soundRef.current = sound;
      setIsPlaying(true);
    } catch (e) {
      console.error("[VoiceNotePlayer] load error", e);
    } finally {
      setIsLoading(false);
    }
  }, [audioUrl, onPlaybackStatus]);

  const handleToggle = useCallback(async () => {
    if (isLoading) return;
    if (!soundRef.current) {
      await loadAndPlay();
      return;
    }
    const status = await soundRef.current.getStatusAsync();
    if (!status.isLoaded) {
      await loadAndPlay();
      return;
    }
    if (status.didJustFinish || (status.positionMillis >= (status.durationMillis ?? 1))) {
      await soundRef.current.setPositionAsync(0);
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }
    if (isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying, isLoading, loadAndPlay]);

  const durationSec = durationMs / 1000;
  const positionSec = positionMs / 1000;
  const timeLabel = isPlaying || positionMs > 0 ? fmtTime(positionSec) : fmtTime(durationProp ?? durationSec);

  // Determine how many bars are "played"
  const playedBars = durationMs > 0 ? Math.round((positionMs / durationMs) * BAR_COUNT) : 0;

  return (
    <View className={`flex-row items-center ${compact ? "py-1" : "py-1.5"}`}>
      {/* Play/pause button */}
      <TouchableOpacity
        onPress={handleToggle}
        activeOpacity={0.7}
        className="w-8 h-8 rounded-full bg-white items-center justify-center mr-2"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Ionicons name={isPlaying ? "pause" : "play"} size={16} color="#000" />
        )}
      </TouchableOpacity>

      {/* Waveform bars */}
      <View
        className="flex-row items-center flex-1"
        style={{ height: MAX_BAR_HEIGHT + 2 }}
      >
        {waveform.map((barHeight, i) => (
          <View
            key={i}
            style={[
              {
                width: BAR_WIDTH,
                height: barHeight,
                borderRadius: BAR_WIDTH / 2,
                marginRight: i < BAR_COUNT - 1 ? BAR_GAP : 0,
                backgroundColor: i < playedBars ? "#fff" : "rgba(255,255,255,0.25)",
              },
            ]}
          />
        ))}
      </View>

      {/* Time label */}
      <Text className="text-[10px] text-theme-neutrals-400 ml-2 w-8 text-right">
        {timeLabel}
      </Text>
    </View>
  );
};

export const VoiceNotePlayer = memo(VoiceNotePlayerComponent);
export default VoiceNotePlayer;
