/**
 * StageRecordingPlayer — the control every recording is played from
 * =================================================================
 * A port of web's component of the same name, so a recording looks and behaves
 * the same whether you meet it in the Recorded list, in a transcript sheet, or
 * on a stage card in the feed: play/pause, a seekable 90-bar waveform, the time
 * remaining, and a pop-out that carries the audio with you.
 *
 * The audio itself lives in libs/stage-playback, shared with every other
 * surface, so playing here stops whatever else was running.
 *
 * `isLoaded` and `isPlaying` are deliberately separate. A paused recording
 * keeps its lit control and its place on the bar — collapsing the two is what
 * made a paused row go dark and lose its position.
 *
 * @module components/Stages/StageRecordingPlayer
 */

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import Icon from "../ui/Icon";
import StageWaveform from "./StageWaveform";
import {
  closeStagePopout,
  getStagePlaybackState,
  hasStageControl,
  openStagePopout,
  popOutStageRecording,
  registerStageControl,
  seekStageRecording,
  stopStageRecording,
  toggleStageRecording,
  useStagePlayback,
  type StagePlayable,
} from "../../libs/stage-playback";

export interface StageRecordingPlayerProps {
  spaceId: string;
  /** No recording, no player — see the null return below. */
  recordingUrl?: string | null;
  /** Shown in the corner player. Falls back to a generic name. */
  title?: string | null;
  /**
   * The stage's span. The container web records into carries no duration of
   * its own, and these two are what the scrub bar falls back to — without them
   * it can still play, but it cannot show progress.
   */
  startedAt?: string | null;
  endedAt?: string | null;
  /** Hide the pop-out control — the corner player itself has no use for one. */
  hidePopout?: boolean;
  /**
   * What happens to a playing recording when this control — the last one for
   * it — goes away. Audio that outlives every control is audible and
   * unreachable, which is precisely the hole the pop-out exists to fill, so
   * neither option is "nothing".
   *
   * `"stop"` matches web, where leaving the page ends a recording that was not
   * popped out. `"popOut"` is for controls whose lifetime is an implementation
   * detail rather than a decision — a feed row unmounts because FlatList
   * recycled it two posts later, and killing the audio for that would read as
   * a bug. Ignored when the recording has already been popped out by hand.
   */
  whenGone?: "stop" | "popOut";
  style?: StyleProp<ViewStyle>;
}

const StageRecordingPlayer: React.FC<StageRecordingPlayerProps> = ({
  spaceId,
  recordingUrl,
  title,
  startedAt,
  endedAt,
  hidePopout = false,
  whenGone = "stop",
  style,
}) => {
  const { spaceId: loadedId, loading, paused, popout, progress, seekable, timeLeft } =
    useStagePlayback();

  const isLoaded = loadedId === spaceId;
  const isPlaying = isLoaded && !paused;
  const busy = isLoaded && loading;
  const isPoppedOut = isLoaded && popout;

  const space: StagePlayable = useMemo(
    () => ({
      id: spaceId,
      title,
      recording_url: recordingUrl,
      started_at: startedAt,
      ended_at: endedAt,
    }),
    [spaceId, title, recordingUrl, startedAt, endedAt],
  );

  const togglePlay = useCallback(() => toggleStageRecording(space), [space]);

  // Pop out an idle recording and it starts playing, which is the only reading
  // of the control that makes sense from a card nobody has pressed play on.
  const togglePopout = useCallback(() => {
    if (isPoppedOut) closeStagePopout();
    else popOutStageRecording(space);
  }, [isPoppedOut, space]);

  const seek = useCallback((position: number) => seekStageRecording(space, position), [space]);

  // Read through a ref so the cleanup does not re-run on every status tick —
  // an effect keyed on the live state would tear down and rebuild five times a
  // second, and stop the audio the first time the id happened to match.
  const goneRef = useRef(whenGone);
  goneRef.current = whenGone;
  useEffect(() => {
    const release = registerStageControl(spaceId);
    return () => {
      release();
      const live = getStagePlaybackState();
      // Still on screen somewhere else (the transcript sheet over its own row),
      // or deliberately carried out to the corner player: leave it alone.
      if (live.spaceId !== spaceId || live.popout || hasStageControl(spaceId)) return;
      if (goneRef.current === "popOut") openStagePopout();
      else stopStageRecording();
    };
  }, [spaceId]);

  // A stage can end without a recording — the host may have blocked the mic
  // prompt, or the upload may have failed. A player that cannot play is worse
  // than no player, so there isn't one.
  if (!recordingUrl) return null;

  return (
    <View style={[styles.row, style]} accessibilityLabel="Stage recording">
      <TouchableOpacity
        onPress={togglePlay}
        style={[styles.playBtn, isLoaded ? styles.playBtnLoaded : styles.playBtnIdle]}
        accessibilityRole="button"
        accessibilityLabel={isPlaying ? "Pause recording" : "Play recording"}
        accessibilityState={{ selected: isLoaded }}
      >
        {busy ? (
          <ActivityIndicator size="small" color={isLoaded ? "#FFFFFF" : "#09090B"} />
        ) : (
          <Icon
            name={isPlaying ? "Pause" : "Play"}
            size={16}
            color={isLoaded ? "#FFFFFF" : "#09090B"}
            fill={isLoaded ? "#FFFFFF" : "#09090B"}
          />
        )}
      </TouchableOpacity>

      {/* Dim until this is the loaded recording, so a list of stage cards reads
          as one live bar and a row of pictures rather than several things all
          claiming to be playing. */}
      <View style={[styles.waveWrap, { opacity: isLoaded ? 1 : 0.4 }]}>
        <StageWaveform
          seed={spaceId}
          height={36}
          style={styles.wave}
          progress={isLoaded ? progress : undefined}
          color="#FFFFFF"
          // Scrubbing an idle row starts it at that point, exactly like web —
          // but only when the source can actually be seeked. See the note in
          // libs/stage-playback about what web's recorder writes.
          onSeek={!isLoaded || seekable ? seek : undefined}
        />
        {isLoaded && !!timeLeft && <Text style={styles.time}>{timeLeft}</Text>}
      </View>

      {!hidePopout && (
        <TouchableOpacity
          onPress={togglePopout}
          style={[styles.popoutBtn, isPoppedOut && styles.popoutBtnOn]}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ selected: isPoppedOut }}
          accessibilityLabel={
            isPoppedOut ? "Close the corner player" : "Pop out — keep listening while you browse"
          }
        >
          <Icon
            name="PictureInPicture2"
            size={16}
            color={isPoppedOut ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 8,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtnIdle: {
    backgroundColor: "#FFFFFF",
  },
  playBtnLoaded: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  waveWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  popoutBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  popoutBtnOn: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
});

export default React.memo(StageRecordingPlayer);
