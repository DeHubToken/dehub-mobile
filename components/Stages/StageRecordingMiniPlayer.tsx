/**
 * StageRecordingMiniPlayer — the corner player for a stage recording
 * ==================================================================
 * Mounted once, app-wide, and shown when somebody asks for it: the pop-out
 * control beside play, in the Recorded list, on a stage card in the feed and in
 * the transcript sheet.
 *
 * It does not show itself when playback starts. Playing in place is the common
 * case; the corner player is for carrying the audio with you while you scroll
 * somewhere else, so it waits to be asked — same rule as web.
 *
 * **Pause and close are two different buttons.** The round control holds the
 * audio where it is; the X ends playback and dismisses the panel.
 *
 * It sits above the live-stage bar rather than on top of it: both are absolute
 * and both default to the same corner, and a stage recording playing while you
 * are in a live room is unusual but not impossible.
 *
 * @module components/Stages/StageRecordingMiniPlayer
 */

import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import Icon from "../ui/Icon";
import StageWaveform from "./StageWaveform";
import { useStages } from "../../context/StageContext";
import {
  closeStagePopout,
  scrubStageRecording,
  stopStageRecording,
  togglePauseStageRecording,
  useStagePlayback,
} from "../../libs/stage-playback";

const StageRecordingMiniPlayer: React.FC = () => {
  const { spaceId, title, loading, paused, popout, progress, seekable, timeLeft } =
    useStagePlayback();
  const { currentSpace, isConnected } = useStages();

  if (!spaceId || !popout) return null;

  const liveBarShowing = !!currentSpace && isConnected;

  return (
    <View
      style={[styles.container, liveBarShowing && styles.aboveLiveBar]}
      accessibilityLabel="Stage recording playback"
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <TouchableOpacity
          onPress={() => {
            stopStageRecording();
            closeStagePopout();
          }}
          hitSlop={8}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Stop and close the player"
        >
          <Icon name="X" size={15} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={togglePauseStageRecording}
          style={styles.playBtn}
          accessibilityRole="button"
          accessibilityLabel={paused ? "Resume recording" : "Pause recording"}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name={paused ? "Play" : "Pause"} size={15} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </TouchableOpacity>

        <View style={[styles.waveWrap, paused && { opacity: 0.6 }]}>
          <StageWaveform
            seed={spaceId}
            height={36}
            style={styles.wave}
            progress={progress}
            color="#FFFFFF"
            onSeek={seekable ? scrubStageRecording : undefined}
          />
        </View>

        {!!timeLeft && <Text style={styles.time}>{timeLeft}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    // Clear of the floating tab bar, matching StageMiniPlayer's own anchor.
    bottom: 80,
    left: 16,
    right: 16,
    borderRadius: 18,
    backgroundColor: "#0C0C0E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    zIndex: 99,
  },
  aboveLiveBar: {
    bottom: 140,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "500",
  },
  closeBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  controlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  waveWrap: {
    flex: 1,
    minWidth: 0,
  },
  wave: {
    flex: 1,
    minWidth: 0,
  },
  time: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    width: 40,
    textAlign: "right",
  },
});

export default StageRecordingMiniPlayer;
