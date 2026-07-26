/**
 * VoiceNotePlayer — Telegram-style voice note waveform player.
 *
 * Features: animated waveform bars, seekable waveform (tap/drag),
 * smooth progress overlay, play/pause with auto-focus management.
 */
import React, { memo, useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, LayoutChangeEvent } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { configureForPlayback } from "../../libs/audioSession";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
  SharedValue,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useIsFocused } from "@react-navigation/native";
import Icon from "../ui/Icon";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { stopActivePreview } from "../../libs/previewRegistry";

const BAR_COUNT = 32;
const BAR_WIDTH = 2.5;
const BAR_GAP = 1.5;
const MAX_BAR_HEIGHT = 24;
const MIN_BAR_HEIGHT = 3;
const PLAYED_COLOR = "#FFFFFF";
const UNPLAYED_COLOR = "rgba(255,255,255,0.25)";

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

const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

interface WaveformBarProps {
  height: number;
  index: number;
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
}

const WaveformBar: React.FC<WaveformBarProps> = memo(({ height, index, progress, isSeeking }) => {
  const threshold = (index + 0.5) / BAR_COUNT;

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const played = p >= threshold;
    const nearHead = Math.abs(p - threshold) < (2 / BAR_COUNT);

    const scale = nearHead && !isSeeking.value ? 1.15 : 1;

    return {
      width: BAR_WIDTH,
      height,
      borderRadius: BAR_WIDTH / 2,
      marginRight: index < BAR_COUNT - 1 ? BAR_GAP : 0,
      backgroundColor: played ? PLAYED_COLOR : UNPLAYED_COLOR,
      transform: [{ scaleY: withSpring(scale, { damping: 12, stiffness: 180 }) }],
    };
  }, [height, index]);

  return <Animated.View style={animStyle} />;
});

interface VoiceNotePlayerProps {
  audioUrl: string;
  duration?: number;
  compact?: boolean;
}

const VoiceNotePlayerComponent: React.FC<VoiceNotePlayerProps> = ({
  audioUrl,
  duration: durationProp,
  compact = false,
}) => {
  // The URL is known at mount, so the source is attached directly — the hook
  // handles loading and releases the player on unmount. This replaces the old
  // manual preload effect.
  const player = useAudioPlayer(audioUrl ? { uri: audioUrl } : null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // MILLISECONDS by convention (durationProp arrives in seconds and is scaled
  // below; the waveform progress ratio divides by it). expo-audio reports
  // seconds, converted at each boundary.
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState((durationProp ?? 0) * 1000);
  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const seekingRef = useRef(false);
  const waveformWidth = useRef(0);
  const isFocused = useIsFocused();

  // Holds a stable identity for the audio-focus registry. The player is read
  // from a ref so this callback never has to be recreated.
  const playerRef = useRef(player);
  playerRef.current = player;

  const focusStopRef = useRef(() => {
    try {
      playerRef.current?.pause();
    } catch {}
    setIsPlaying(false);
    releaseAudioFocus(focusStopRef.current);
  });

  const waveform = useMemo(() => generateWaveform(audioUrl), [audioUrl]);

  // Status arrives on the player's event stream. All positions are converted
  // from expo-audio's SECONDS into this component's millisecond convention.
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.isLoaded) return;
      if (seekingRef.current) return;
      const posMs = status.currentTime * 1000;
      const statusDurMs = status.duration ? status.duration * 1000 : 0;
      setPositionMs(posMs);
      if (statusDurMs) setDurationMs(statusDurMs);
      const dur = statusDurMs || durationMs || 1;
      progress.value = withTiming(posMs / dur, {
        duration: 200,
        easing: Easing.linear,
      });
      if (status.didJustFinish) {
        setIsPlaying(false);
        progress.value = withTiming(0, { duration: 300 });
        setPositionMs(0);
        releaseAudioFocus(focusStopRef.current);
      }
    });
    return () => sub.remove();
  }, [player, durationMs, progress]);

  useEffect(() => {
    if (!isFocused && isPlaying) {
      try {
        player.pause();
      } catch {}
      setIsPlaying(false);
      releaseAudioFocus(focusStopRef.current);
    }
  }, [isFocused, isPlaying, player]);

  useEffect(() => {
    const stopFn = focusStopRef.current;
    // useAudioPlayer releases the native player itself; only the focus
    // registration needs unwinding here.
    return () => {
      releaseAudioFocus(stopFn);
    };
  }, []);

  const loadAndPlay = useCallback(async () => {
    try {
      setIsLoading(true);
      requestAudioFocus(focusStopRef.current);
      stopActivePreview();
      await configureForPlayback();
      // The source is already attached by useAudioPlayer, so this only needs
      // to (re)start playback rather than tear down and rebuild a Sound.
      player.play();
      setIsPlaying(true);
    } catch (e) {
      console.error("[VoiceNotePlayer] load error", e);
      releaseAudioFocus(focusStopRef.current);
    } finally {
      setIsLoading(false);
    }
  }, [player]);

  const handleToggle = useCallback(async () => {
    if (isLoading) return;
    if (!player.isLoaded) {
      await loadAndPlay();
      return;
    }
    // At (or past) the end — restart from zero. currentTime/duration are in
    // SECONDS here, so the comparison stays in seconds rather than millis.
    if (player.duration > 0 && player.currentTime >= player.duration) {
      requestAudioFocus(focusStopRef.current);
      stopActivePreview();
      await player.seekTo(0);
      player.play();
      setIsPlaying(true);
      return;
    }
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      releaseAudioFocus(focusStopRef.current);
    } else {
      requestAudioFocus(focusStopRef.current);
      stopActivePreview();
      player.play();
      setIsPlaying(true);
    }
  }, [isPlaying, isLoading, loadAndPlay, player]);

  const seekTo = useCallback(async (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const dur = durationMs || 1;
    const posMs = Math.round(clamped * dur);
    setPositionMs(posMs);
    progress.value = clamped;
    try {
      // posMs is milliseconds; seekTo takes seconds.
      await player.seekTo(posMs / 1000);
    } catch { /* ignore seek errors */ }
  }, [durationMs, progress, player]);

  const onSeekStart = useCallback(() => {
    seekingRef.current = true;
    isSeeking.value = true;
  }, [isSeeking]);

  const onSeekEnd = useCallback((ratio: number) => {
    seekingRef.current = false;
    isSeeking.value = false;
    seekTo(ratio);
  }, [seekTo, isSeeking]);

  const seekGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(0)
        .minDistance(0)
        .onStart((e) => {
          runOnJS(onSeekStart)();
          const ratio = waveformWidth.current > 0 ? e.x / waveformWidth.current : 0;
          progress.value = Math.max(0, Math.min(1, ratio));
        })
        .onUpdate((e) => {
          const ratio = waveformWidth.current > 0 ? e.x / waveformWidth.current : 0;
          progress.value = Math.max(0, Math.min(1, ratio));
        })
        .onEnd((e) => {
          const ratio = waveformWidth.current > 0 ? e.x / waveformWidth.current : 0;
          runOnJS(onSeekEnd)(Math.max(0, Math.min(1, ratio)));
        }),
    [onSeekStart, onSeekEnd, progress],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((e) => {
        const ratio = waveformWidth.current > 0 ? e.x / waveformWidth.current : 0;
        runOnJS(seekTo)(Math.max(0, Math.min(1, ratio)));
      }),
    [seekTo],
  );

  const composedGesture = useMemo(
    () => Gesture.Race(seekGesture, tapGesture),
    [seekGesture, tapGesture],
  );

  const onWaveformLayout = useCallback((e: LayoutChangeEvent) => {
    waveformWidth.current = e.nativeEvent.layout.width;
  }, []);

  const playButtonScale = useSharedValue(1);
  const playBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playButtonScale.value }],
  }));

  const handlePlayPress = useCallback(() => {
    playButtonScale.value = withSpring(0.85, { damping: 10 });
    setTimeout(() => {
      playButtonScale.value = withSpring(1, { damping: 10 });
    }, 100);
    handleToggle();
  }, [handleToggle, playButtonScale]);

  const durationSec = durationMs / 1000;
  const positionSec = positionMs / 1000;
  const timeLabel = isPlaying || positionMs > 0
    ? fmtTime(positionSec)
    : fmtTime(durationProp ?? durationSec);

  return (
    <View className={`flex-row items-center ${compact ? "py-1.5" : "py-2"}`}>
      <Animated.View style={playBtnStyle}>
        <TouchableOpacity
          onPress={handlePlayPress}
          activeOpacity={0.7}
          className="w-9 h-9 rounded-full bg-white items-center justify-center mr-2.5"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000" />
          ) : (
            <Icon
              name={isPlaying ? "Pause" : "Play"}
              size={16}
              color="#000"
              fill={isPlaying ? undefined : "#000"}
            />
          )}
        </TouchableOpacity>
      </Animated.View>

      <GestureDetector gesture={composedGesture}>
        <View
          className="flex-row items-center flex-1"
          style={{ height: MAX_BAR_HEIGHT + 4 }}
          onLayout={onWaveformLayout}
        >
          {waveform.map((barHeight, i) => (
            <WaveformBar
              key={i}
              height={barHeight}
              index={i}
              progress={progress}
              isSeeking={isSeeking}
            />
          ))}
        </View>
      </GestureDetector>

      <Text className="text-[10px] text-theme-neutrals-400 ml-2.5 min-w-[28px] text-right">
        {timeLabel}
      </Text>
    </View>
  );
};

export const VoiceNotePlayer = memo(VoiceNotePlayerComponent);
export default VoiceNotePlayer;
