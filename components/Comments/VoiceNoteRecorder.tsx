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
import Ionicons from "@expo/vector-icons/Ionicons";
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

const WAVEFORM_BARS = 64;
const BAR_W = 2;
const BAR_GAP = 1.5;
const MAX_BAR_H = 24;
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
    // Newest on the right; a narrow row drops the oldest off the left edge.
    <View className="flex-row items-center flex-1" style={{ height: MAX_BAR_H + 2, justifyContent: "flex-end", overflow: "hidden", minWidth: 0 }}>
      {display.map((level, i) => (
        <View
          key={i}
          style={{
            width: BAR_W,
            height: Math.max(MIN_BAR_H, level * MAX_BAR_H),
            borderRadius: 1,
            marginRight: i < WAVEFORM_BARS - 1 ? BAR_GAP : 0,
            backgroundColor: "rgba(255,255,255,0.85)",
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
      style={[
        containerStyle,
        {
          // The Stage Strip recording row: the same glass row as the player.
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 10,
          marginVertical: 6,
          height: 46,
          paddingLeft: 12,
          paddingRight: 5,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          backgroundColor: "rgba(255,255,255,0.08)",
        },
      ]}
    >
      <Animated.View
        style={pulseStyle}
        className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2"
      />
      <Text
        className="text-red-400 mr-2"
        style={{ fontSize: 12, fontVariant: ["tabular-nums"] }}
      >
        {fmtTime(elapsedMs)}
      </Text>

      <RecordingWaveform bars={meterBars} />

      <TouchableOpacity
        onPress={cancelRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("comments.cancelRecording")}
        style={{
          marginLeft: 8, width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.1)",
          backgroundColor: "rgba(255,255,255,0.1)",
        }}
      >
        <Ionicons name="trash-outline" size={17} color={"#F4F4F5"} />
      </TouchableOpacity>

      <TouchableOpacity
        onPress={stopRecording}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t("comments.sendVoiceNote")}
        style={{
          marginLeft: 6, width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center",
          backgroundColor: "#FFFFFF",
        }}
      >
        {isStopping ? (
          <ActivityIndicator size="small" color={"#000000"} />
        ) : (
          <Ionicons name="checkmark" size={19} color={"#000000"} />
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export const VoiceNoteRecordingOverlay = memo(OverlayComponent);

/* Default export — kept for backwards compat */
export default VoiceNoteRecordingOverlay;
