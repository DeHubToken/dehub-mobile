/**
 * VoiceNoteRecorder — Simple tap-to-record voice note recorder.
 *
 * Exports:
 *   useVoiceRecorder(opts)        — hook: recording state + start/stop/cancel
 *   VoiceNoteRecordingOverlay     — recording bar (timer, waveform, trash, ✓)
 *   VoiceNoteResult               — type: recorded audio result
 *
 * Tap the mic icon → recording starts immediately.
 * Overlay shows: pulsing red dot + timer + waveform + trash (cancel) + ✓ (stop & send).
 *
 * Max 29 s client-side to prevent server 30 s rejection.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from "expo-av";
import { runWithPermissions } from "../../libs/permissions.util";

/* ─── Constants ─────────────────────────────────────────────── */
const MAX_DURATION_MS = 29_000; // 29 s — prevents server 30 s rejection

const WAVEFORM_BARS = 35;
const BAR_W = 2.5;
const BAR_GAP = 1.5;
const MAX_BAR_H = 20;
const MIN_BAR_H = 3;

const fmtTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

/** Normalize dB metering to 0‑1 */
const normMeter = (dB: number | undefined): number => {
  if (dB == null || dB <= -160) return 0.05;
  return Math.max(0.05, Math.min(1, (dB + 40) / 40));
};

/* ─── Public types ──────────────────────────────────────────── */
export interface VoiceNoteResult {
  uri: string;
  durationMs: number;
  mimeType: string;
}

export interface UseVoiceRecorderOpts {
  onRecordingComplete: (result: VoiceNoteResult) => void;
  onCancel: () => void;
}

export interface VoiceRecorderHandle {
  isRecording: boolean;
  isStopping: boolean;
  elapsedMs: number;
  meterBars: number[];
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
}

export const useVoiceRecorder = ({
  onRecordingComplete,
  onCancel,
}: UseVoiceRecorderOpts): VoiceRecorderHandle => {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isStopping, setIsStopping] = useState(false);
  const [meterBars, setMeterBars] = useState<number[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const meterBarsRef = useRef<number[]>([]);

  /* ── Timer: elapsed + metering ──────────────────────────────── */
  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = Date.now();
      meterBarsRef.current = [];
      timerRef.current = setInterval(async () => {
        const elapsed = Date.now() - startTimeRef.current;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_DURATION_MS) {
          stopRef.current();
          return;
        }
        try {
          const rec = recordingRef.current;
          let level: number;
          if (rec) {
            const st = await rec.getStatusAsync();
            level = normMeter((st as any).metering);
          } else {
            // Recording not ready yet — show gentle idle animation
            level = 0.08 + Math.random() * 0.12;
          }
          const bars = meterBarsRef.current;
          bars.push(level);
          if (bars.length > WAVEFORM_BARS) bars.shift();
          meterBarsRef.current = bars;
          setMeterBars([...bars]);
        } catch {}
      }, 150);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isRecording]);

  /* ── cancel ────────────────────────────────────────────────── */
  const cancelInternal = useCallback(async () => {
    try {
      const rec = recordingRef.current;
      if (rec) {
        const s = await rec.getStatusAsync();
        if (s.isRecording) await rec.stopAndUnloadAsync();
      }
    } catch {}
    recordingRef.current = null;
    setIsRecording(false);
    setElapsedMs(0);
    setMeterBars([]);
    Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    onCancel();
  }, [onCancel]);

  /* ── stop ──────────────────────────────────────────────────── */
  const stopInternal = useCallback(async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      const rec = recordingRef.current;
      if (!rec) {
        onCancel();
        return;
      }
      const status = await rec.getStatusAsync();
      if (status.isRecording) await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      const durationMs = status.durationMillis || elapsedMs;
      recordingRef.current = null;
      setIsRecording(false);
      setElapsedMs(0);
      setMeterBars([]);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      if (uri && durationMs > 500) {
        onRecordingComplete({
          uri,
          durationMs,
          mimeType: Platform.OS === "ios" ? "audio/m4a" : "audio/mp4",
        });
      } else {
        onCancel();
      }
    } catch (e) {
      console.error("[VoiceRecorder] stop error", e);
      onCancel();
    } finally {
      setIsStopping(false);
    }
  }, [isStopping, elapsedMs, onRecordingComplete, onCancel]);

  // Stable refs for timer auto-stop
  const stopRef = useRef(stopInternal);
  stopRef.current = stopInternal;

  /* ── start ─────────────────────────────────────────────────── */
  const startRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        try {
          const prev = recordingRef.current;
          const s = await prev.getStatusAsync();
          if (s.isRecording || s.canRecord) await prev.stopAndUnloadAsync();
        } catch {}
        recordingRef.current = null;
      }

      // Gate on permission BEFORE showing recording UI or starting the timer
      let micGranted = false;
      await runWithPermissions(["microphone"], async () => {
        micGranted = true;
      });
      if (!micGranted) {
        console.warn("[VoiceRecorder] mic permission denied");
        onCancel();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      recordingRef.current = recording;

      // Only show recording UI + start timer AFTER recording is actually running
      setIsRecording(true);
      setElapsedMs(0);
      setMeterBars([]);
    } catch (e) {
      console.error("[VoiceRecorder] start error", e);
      setIsRecording(false);
      onCancel();
    }
  }, [onCancel]);

  return {
    isRecording,
    isStopping,
    elapsedMs,
    meterBars,
    startRecording,
    stopRecording: stopInternal,
    cancelRecording: cancelInternal,
  };
};

/* ─── Recording waveform bars ───────────────────────────────── */
const RecordingWaveform: React.FC<{ bars: number[] }> = memo(({ bars }) => {
  const display =
    bars.length >= WAVEFORM_BARS
      ? bars.slice(-WAVEFORM_BARS)
      : [...Array(WAVEFORM_BARS - bars.length).fill(0.05), ...bars];

  return (
    <View className="flex-row items-center flex-1" style={{ height: MAX_BAR_H + 2 }}>
      {display.map((level, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: Math.max(MIN_BAR_H, level * MAX_BAR_H),
            borderRadius: BAR_W / 2,
            marginRight: i < WAVEFORM_BARS - 1 ? BAR_GAP : 0,
            backgroundColor: "rgba(255,255,255,0.7)",
          }}
        />
      ))}
    </View>
  );
});

interface VoiceNoteRecordingOverlayProps {
  recorder: VoiceRecorderHandle;
}

const OverlayComponent: React.FC<VoiceNoteRecordingOverlayProps> = ({
  recorder,
}) => {
  const {
    isRecording,
    isStopping,
    elapsedMs,
    meterBars,
    stopRecording,
    cancelRecording,
  } = recorder;

  /* ── Animations ──────────────────────────────────────────── */
  const pulseOpacity = useSharedValue(1);
  const containerOpacity = useSharedValue(0);

  useEffect(() => {
    if (isRecording) {
      containerOpacity.value = withTiming(1, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      });
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      );
    } else {
      containerOpacity.value = withTiming(0, { duration: 120 });
      cancelAnimation(pulseOpacity);
      pulseOpacity.value = 1;
    }
  }, [isRecording, containerOpacity, pulseOpacity]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
  const containerStyle = useAnimatedStyle(() => ({ opacity: containerOpacity.value }));

  if (!isRecording) return null;

  return (
    <Animated.View
      style={containerStyle}
      className="flex-row items-center px-4 py-3 bg-theme-neutrals-800"
    >
      <Animated.View
        style={pulseStyle}
        className="w-2.5 h-2.5 rounded-full bg-white mr-2"
      />
      <Text
        className="text-white text-sm mr-3"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {fmtTime(elapsedMs)}
      </Text>

      <RecordingWaveform bars={meterBars} />

      <TouchableOpacity
        onPress={cancelRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        className="ml-3 w-10 h-10 rounded-full bg-theme-neutrals-700 items-center justify-center"
      >
        <Ionicons name="trash-outline" size={20} color="#F4F4F5" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={stopRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Send voice note"
        className="ml-2 w-10 h-10 rounded-full bg-white items-center justify-center"
      >
        {isStopping ? (
          <ActivityIndicator size="small" color="#000" />
        ) : (
          <Ionicons name="checkmark" size={22} color="#000" />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export const VoiceNoteRecordingOverlay = memo(OverlayComponent);

/* Default export — kept for backwards compat */
export default VoiceNoteRecordingOverlay;
