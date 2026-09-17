/**
 * The thin timeline that sits on the floor of a fullscreen viewer.
 *
 * Lifted out of ShortsViewerScreen so the live viewer gets the exact same bar
 * rather than a second one that looks nearly right: 2pt at rest, 4pt and a
 * thumb while a finger is on it, 24pt of hit area under a 2pt line, and the
 * same four greys. If a value changes it changes here and both surfaces move.
 *
 * The caller owns the clock. It writes `progress` (0..1) from whatever is
 * playing and gets `onSeek` back when the finger lifts; a drag owns the bar in
 * between, so the caller must stop writing while `onScrubbingChange` is true or
 * the clock yanks the line back to wherever playback still is.
 */
import React, { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import type { GestureType } from "react-native-gesture-handler";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useScrubGesture } from "../../hooks/useScrubGesture";
import { EDGE } from "./ViewerChrome";

interface Props {
  /** 0..1 of the timeline. Owned by the caller, read on the UI thread. */
  progress: SharedValue<number>;
  /** Finger up: the position to play from. */
  onSeek: (ratio: number) => void;
  /** Off for a stream with no seekable window — the bar still draws. */
  enabled?: boolean;
  /** Tells the caller to stop writing `progress` for the length of a drag. */
  onScrubbingChange?: (scrubbing: boolean) => void;
  /** Gestures this one must outrank, e.g. a pager the viewer sits in. */
  blocks?: (GestureType | React.RefObject<GestureType | undefined>)[];
}

const ViewerScrubBar: React.FC<Props> = ({
  progress,
  onSeek,
  enabled = true,
  onScrubbingChange,
  blocks,
}) => {
  const [scrubbing, setScrubbing] = useState(false);

  const handleScrubStart = useCallback(() => {
    setScrubbing(true);
    onScrubbingChange?.(true);
  }, [onScrubbingChange]);

  const handleScrub = useCallback(
    (ratio: number) => {
      progress.value = ratio;
    },
    [progress]
  );

  const handleCommit = useCallback(
    (ratio: number) => {
      progress.value = ratio;
      setScrubbing(false);
      onScrubbingChange?.(false);
      onSeek(ratio);
    },
    [progress, onSeek, onScrubbingChange]
  );

  const handleCancel = useCallback(() => {
    setScrubbing(false);
    onScrubbingChange?.(false);
  }, [onScrubbingChange]);

  const blockList = useMemo(() => blocks, [blocks]);

  const { onLayout, gesture, touchGuard } = useScrubGesture({
    onScrubStart: handleScrubStart,
    onScrub: handleScrub,
    onCommit: handleCommit,
    onCancel: handleCancel,
    enabled,
    // A dedicated target at the foot of the screen: it takes the touch straight
    // away instead of waiting for travel.
    immediate: true,
    blocks: blockList,
  });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    left: `${Math.max(0, Math.min(1, progress.value)) * 100}%`,
  }));

  return (
    <View style={styles.track} pointerEvents={enabled ? "auto" : "none"}>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.hitArea}
          onLayout={onLayout}
          {...touchGuard}
          accessibilityRole="adjustable"
        >
          <View style={[styles.line, scrubbing && styles.lineActive]}>
            <Reanimated.View
              style={[styles.fill, scrubbing && styles.fillActive, fillStyle]}
            />
          </View>
          {scrubbing ? (
            <Reanimated.View style={[styles.thumb, thumbStyle]} pointerEvents="none" />
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Above the bottom scrim, below whatever chrome is drawn after it.
    zIndex: 8,
  },
  hitArea: {
    // The line is 2pt; the finger gets 24.
    height: 24,
    justifyContent: "flex-end",
    paddingHorizontal: EDGE,
    paddingBottom: 6,
  },
  line: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.25)",
    justifyContent: "center",
  },
  lineActive: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  fillActive: {
    backgroundColor: "#fff",
  },
  thumb: {
    position: "absolute",
    bottom: 1,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
});

export default memo(ViewerScrubBar);
