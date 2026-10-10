import type { VoiceRecorderHandle } from '../../hooks/useVoiceRecorder';
export { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
export type { VoiceNoteResult, UseVoiceRecorderOpts, VoiceRecorderHandle } from '../../hooks/useVoiceRecorder';
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
import React, { memo, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
import { useTranslation } from "react-i18next";

/* ─── Constants ─────────────────────────────────────────────── */

const WAVEFORM_BARS = 35;
const BAR_W = 2.5;
const BAR_GAP = 1.5;
const MAX_BAR_H = 20;
const MIN_BAR_H = 3;

const fmtTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

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
  const { t } = useTranslation();
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
        accessibilityLabel={t("comments.cancelRecording")}
        className="ml-3 w-10 h-10 rounded-xl bg-theme-neutrals-700 items-center justify-center"
      >
        <Ionicons name="trash-outline" size={20} color="#F4F4F5" />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={stopRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("comments.sendVoiceNote")}
        className="ml-2 w-10 h-10 rounded-xl bg-white items-center justify-center"
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
