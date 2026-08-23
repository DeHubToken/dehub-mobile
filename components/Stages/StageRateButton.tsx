/**
 * StageRateButton — the playback-speed chip for stage recordings
 * =============================================================
 * Port of web's component of the same name. Cycles the shared engine's rate
 * through the same ladder the video players use; libs/stage-playback persists
 * it and applies it to every surface that plays a recording.
 *
 * @module components/Stages/StageRateButton
 */

import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";

import { cycleStageRecordingRate, useStagePlayback } from "../../libs/stage-playback";

export function formatStageRate(rate: number): string {
  return `${rate}x`;
}

const StageRateButton: React.FC = () => {
  const { rate } = useStagePlayback();

  return (
    <TouchableOpacity
      onPress={cycleStageRecordingRate}
      style={[styles.chip, rate !== 1 && styles.chipOn]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${formatStageRate(rate)}`}
    >
      <Text style={styles.label}>{formatStageRate(rate)}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  chip: {
    height: 28,
    minWidth: 36,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  label: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});

export default React.memo(StageRateButton);
