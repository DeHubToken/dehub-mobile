import { useTranslation as _useCopy } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import { GLASS_PLAYBACK_CONTROL } from '../../theme/skins';
/**
 * VoiceNotePlayer — the Stage Strip voice note player, matching the web's
 * VoiceStripPlayer: a glass row, a square play key, thin mirrored bars that
 * fill as it plays and bounce around the playhead, the time and a speed chip.
 * Tap or drag the bars to scrub. Comments, DMs, live and community chats.
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

const BAR_WIDTH = 2;
const BAR_GAP = 1.5;
const MAX_BAR_HEIGHT = 27;
const MIN_BAR_HEIGHT = 3;
const DEFAULT_BARS = 48;
const RATES = [1, 1.5, 2] as const;

/** Seeded heights with a voice-like rise and fall, so a note keeps its shape. */
const generateWaveform = (seed: string, count: number): number[] => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = ((h * 16807) + 12345) & 0x7fffffff;
    const noise = 0.35 + 0.65 * ((h % 100) / 100);
    const env = 0.35 + 0.65 * Math.sin((i / Math.max(1, count - 1)) * Math.PI);
    bars.push(MIN_BAR_HEIGHT + env * noise * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT));
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
  count: number;
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  playing: SharedValue<number>;
  light?: boolean;
}

const WaveformBar: React.FC<WaveformBarProps> = memo(({ height, index, count, progress, isSeeking, playing, light }) => {
  const threshold = (index + 0.5) / count;
  const ink = light ? "17,17,17" : "255,255,255";
  const dim = 0.18 + (height / MAX_BAR_HEIGHT) * 0.14;

  const animStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const played = p >= threshold;
    const d = Math.abs(p - threshold);
    // Bars just around the playhead bounce while it plays, like Stages.
    const bounce = playing.value && !isSeeking.value && d < 0.07
      ? 1 + 0.4 * (1 - d / 0.07) * Math.abs(Math.sin(playing.value * 14 + index * 1.7))
      : 1;
    return {
      backgroundColor: `rgba(${ink},${played ? 0.95 : dim})`,
      transform: [{ scaleY: Math.min(MAX_BAR_HEIGHT / height, bounce) }],
    };
  }, [height, index, count, light]);

  return (
    <Animated.View
      style={[{ width: BAR_WIDTH, height, borderRadius: 1, marginRight: BAR_GAP }, animStyle]}
    />
  );
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
  const { t: _copy } = _useCopy();
  const { theme, isLight } = useAppTheme();
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
  const [barCount, setBarCount] = useState(DEFAULT_BARS);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const rateRef = useRef<number>(1);
  rateRef.current = rate;
  // Seconds of wall clock while playing, 0 when stopped: drives the bounce.
  const playingClock = useSharedValue(0);
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

  const waveform = useMemo(() => generateWaveform(audioUrl, barCount), [audioUrl, barCount]);

  useEffect(() => {
    if (!isPlaying) { playingClock.value = 0; return; }
    let raf = 0;
    const tick = () => {
      playingClock.value = Date.now() / 1000 % 1000 + 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, playingClock]);

  const cycleRate = useCallback(() => {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    try { player.setPlaybackRate(next); } catch { /* older players keep 1x */ }
  }, [rate, player]);

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
      try { player.setPlaybackRate(rateRef.current); } catch { /* 1x */ }
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
      try { player.setPlaybackRate(rateRef.current); } catch { /* 1x */ }
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
      try { player.setPlaybackRate(rateRef.current); } catch { /* 1x */ }
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
    const w = e.nativeEvent.layout.width;
    waveformWidth.current = w;
    const n = Math.max(16, Math.floor((w + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    setBarCount((c) => (c === n ? c : n));
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

  // Written dark: System Light's tone pass (libs/jsx/tone.js) flips these
  // greys to ink on white. Only the animated bars, which skip that pass, pick
  // their own light colours.
  const glass = theme === 'glass';
  const ink = '#FFFFFF';
  const playBg = isPlaying ? '#FFFFFF' : 'rgba(255,255,255,0.15)';
  const playFg = isPlaying ? '#000000' : ink;
  const muted = 'rgba(255,255,255,0.55)';
  const line = 'rgba(255,255,255,0.08)';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: line,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: compact ? 5 : 6,
        paddingLeft: 6,
        paddingRight: 8,
        marginVertical: compact ? 2 : 4,
        gap: 8,
      }}
    >
      <Animated.View style={playBtnStyle}>
        <TouchableOpacity
          onPress={handlePlayPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? _copy("copy.e01c5d16178b", { defaultValue: "Pause voice note" }) : _copy("copy.89ce2d7c9996", { defaultValue: "Play voice note" })}
          style={[
            { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: playBg },
            glass && !isPlaying ? { ...GLASS_PLAYBACK_CONTROL, borderRadius: 9 } : null,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={playFg} />
          ) : (
            <Icon
              name={isPlaying ? "Pause" : "Play"}
              size={14}
              color={playFg}
              fill={playFg}
            />
          )}
        </TouchableOpacity>
      </Animated.View>

      <GestureDetector gesture={composedGesture}>
        <View
          style={{ flex: 1, minWidth: 0, height: 30, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}
          onLayout={onWaveformLayout}
        >
          {waveform.map((barHeight, i) => (
            <WaveformBar
              key={i}
              height={barHeight}
              index={i}
              count={waveform.length}
              progress={progress}
              isSeeking={isSeeking}
              playing={playingClock}
              light={isLight}
            />
          ))}
        </View>
      </GestureDetector>

      <Text style={{ fontSize: 11, color: muted, minWidth: 30, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
        {timeLabel}
      </Text>
      <TouchableOpacity
        onPress={cycleRate}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={_copy("copy.9bf75671f22f", { defaultValue: "Playback speed {{value1}}", value1: `${rate}x` })}
        hitSlop={6}
        style={{
          height: 24,
          minWidth: 30,
          paddingHorizontal: 6,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: rate !== 1 ? 'transparent' : line,
          backgroundColor: rate !== 1 ? 'rgba(255,255,255,0.2)' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: rate !== 1 ? ink : muted, fontVariant: ['tabular-nums'] }}>{`${rate}x`}</Text>
      </TouchableOpacity>
    </View>
  );
};

export const VoiceNotePlayer = memo(VoiceNotePlayerComponent);
export default VoiceNotePlayer;
