/**
 * AudioPostMiniPlayer — the corner player for a popped-out audio post
 * ===================================================================
 * Mounted once, app-wide, beside RadioMiniPlayer. It shows only when a card
 * asks for it: playing in place is the common case, and this is for carrying
 * the track with you while you scroll somewhere else — so it waits to be
 * asked, same rule as the stage recording player.
 *
 * **Pause and close are two different buttons.** The round control holds the
 * track where it is; the X ends playback and dismisses the panel.
 *
 * It shares its corner with the radio and stage players, which is safe
 * because all of them go through the app's audio focus manager: popping a
 * post out stops the radio and vice versa, so two are never up at once.
 *
 * @module components/Home/AudioPostMiniPlayer
 */

import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import { Easing, useSharedValue, withTiming } from "react-native-reanimated";

import Icon from "../ui/Icon";
import { useStages } from "../../context/StageContext";
import { getCachedHue } from "../../libs/audioHueState";
import {
  seekAudioPost,
  stopAudioPost,
  toggleAudioPost,
  useAudioPostPlayback,
} from "../../libs/audio-post-playback";
import { SeekBar, fmtDuration, useSeekSurface } from "./AudioPostPlayer";

const noop = () => {};

const AudioPostMiniPlayer: React.FC = () => {
  const { t } = useTranslation();
  const { tokenId, track, isPlaying, isLoading, progress, currentTime, duration } =
    useAudioPostPlayback();
  const { currentSpace, isConnected } = useStages();

  // The scrubber follows the engine off a shared value, and stops following
  // it for the length of a drag so the finger wins over the status ticks.
  const position = useSharedValue(0);
  const draggingRef = useRef(false);
  const progressRef = useRef(0);
  progressRef.current = progress;

  useEffect(() => {
    if (draggingRef.current) return;
    position.value = withTiming(progress, { duration: 100, easing: Easing.linear });
  }, [progress, position]);

  // Identity-stable, every one: they feed a PanResponder built in a useMemo.
  const onScrubStart = useCallback(() => {
    draggingRef.current = true;
  }, []);
  const onCommit = useCallback((ratio: number) => {
    draggingRef.current = false;
    seekAudioPost(ratio);
  }, []);
  const onCancel = useCallback(() => {
    draggingRef.current = false;
    position.value = withTiming(progressRef.current, { duration: 120, easing: Easing.linear });
  }, [position]);

  const seek = useSeekSurface({
    position,
    onScrubStart,
    onScrub: noop,
    onCommit,
    onCancel,
    claimOnStart: true,
  });

  if (!tokenId || !track) return null;

  const liveBarShowing = !!currentSpace && isConnected;

  return (
    <View
      style={[styles.container, liveBarShowing && styles.aboveLiveBar]}
      accessibilityLabel={t("audioPost.cornerPlayer")}
    >
      <View style={styles.row}>
        <View style={styles.art}>
          {track.artworkUrl ? (
            <Image source={{ uri: track.artworkUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Icon name="AudioLines" size={16} color="#808089" />
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {`${track.artist}  ·  ${fmtDuration(currentTime)} / ${fmtDuration(duration)}`}
          </Text>
        </View>

        <TouchableOpacity
          onPress={toggleAudioPost}
          style={styles.playBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? t("audioPost.pause") : t("audioPost.play")}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Icon name={isPlaying ? "Pause" : "Play"} size={15} color="#FFFFFF" fill="#FFFFFF" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={stopAudioPost}
          style={styles.closeBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("audioPost.stopAndClose")}
        >
          <Icon name="X" size={15} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>

      <SeekBar
        position={position}
        hue={getCachedHue()}
        onLayout={seek.onLayout}
        panHandlers={seek.panHandlers}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    // Clear of the floating tab bar, matching RadioMiniPlayer's own anchor.
    bottom: 80,
    left: 16,
    right: 16,
    borderRadius: 18,
    backgroundColor: "#0C0C0E",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 99,
  },
  aboveLiveBar: {
    bottom: 140,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  art: {
    width: 34,
    height: 34,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#18181B",
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
  },
  sub: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default AudioPostMiniPlayer;
