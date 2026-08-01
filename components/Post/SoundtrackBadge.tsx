import React, { useCallback, useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, Animated, Easing } from "react-native";
import { useAudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { configureForDuckedPlayback } from "../../libs/audioSession";

interface Props {
  title: string;
  creator: string;
  url: string;
}

const SoundtrackBadge: React.FC<Props> = ({ title, creator, url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Source is null on purpose: this badge renders on every feed row that has a
  // soundtrack, and useAudioPlayer re-creates the native player whenever the
  // source changes. Starting empty means no media is allocated for the many
  // badges that are mounted but never tapped; the track is attached in
  // togglePlay via player.replace(). The hook releases the player on unmount.
  const player = useAudioPlayer(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startSpin = useCallback(() => {
    spinAnim.setValue(0);
    spinLoop.current = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spinLoop.current.start();
  }, [spinAnim]);

  const stopSpin = useCallback(() => {
    spinLoop.current?.stop();
  }, []);

  useEffect(() => {
    if (isPlaying) startSpin();
    else stopSpin();
  }, [isPlaying, startSpin, stopSpin]);

  // Loop is set once. expo-audio has no per-play `isLooping` option — it is a
  // property on the player.
  useEffect(() => {
    player.loop = true;
  }, [player]);

  const stopPlayback = useCallback(async () => {
    try {
      // No stop() in expo-audio — pause and rewind is the equivalent.
      player.pause();
      await player.seekTo(0);
    } catch {}
    setIsPlaying(false);
    releaseAudioFocus(stopPlayback);
  }, [player]);

  // Hoisted out of togglePlay: expo-av attached this per Sound instance, but
  // expo-audio has one long-lived player, so the subscription belongs in an
  // effect with a matching teardown. Declared after stopPlayback so the
  // reference below is not in its temporal dead zone.
  useEffect(() => {
    const sub = player.addListener("playbackStatusUpdate", (s) => {
      // Guarded on !loop deliberately. The old code set isLooping AND handled
      // didJustFinish, which contradict each other: if the event fires at each
      // loop boundary, the badge would flip to a play icon and drop audio focus
      // while the track keeps looping — so the next player would not stop this
      // one and two tracks would play at once.
      if (!player.loop && s.isLoaded && s.didJustFinish) {
        setIsPlaying(false);
        releaseAudioFocus(stopPlayback);
      }
    });
    return () => sub.remove();
  }, [player, stopPlayback]);

  const togglePlay = useCallback(async () => {
    if (isLoading) return;

    // Already playing — pause. play()/pause() are synchronous in expo-audio,
    // so there is nothing to await or catch.
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
      releaseAudioFocus(stopPlayback);
      return;
    }

    // Resume from pause. isLoaded is a plain property here, not an async
    // getStatusAsync() call.
    if (!isPlaying && player.isLoaded) {
      requestAudioFocus(stopPlayback);
      player.play();
      setIsPlaying(true);
      return;
    }

    // Fresh load
    setIsLoading(true);
    try {
      await configureForDuckedPlayback();
      requestAudioFocus(stopPlayback);
      // replace() attaches the source to the existing player; loop was set in
      // the effect above, and play() stands in for the old shouldPlay option.
      player.replace({ uri: url });
      player.play();
      setIsPlaying(true);
    } catch (e) {
      console.warn("[SoundtrackBadge] Playback error:", e);
      releaseAudioFocus(stopPlayback);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isPlaying, url, stopPlayback, player]);

  // useAudioPlayer releases the native player on unmount, so only the audio
  // focus registration needs cleaning up here.
  useEffect(() => {
    return () => {
      releaseAudioFocus(stopPlayback);
    };
  }, [stopPlayback]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <TouchableOpacity
      onPress={togglePlay}
      activeOpacity={0.75}
      style={styles.container}
    >
      <Animated.View style={[styles.disc, { transform: [{ rotate: spin }] }]}>
        <Ionicons name="musical-note" size={12} color="#fff" />
      </Animated.View>

      <Text style={styles.text} numberOfLines={1} ellipsizeMode="tail">
        {title || "Untitled"}{creator ? ` — ${creator}` : ""}
      </Text>

      <View style={styles.playBtn}>
        <Ionicons
          name={isLoading ? "hourglass" : isPlaying ? "pause" : "play"}
          size={11}
          color="#fff"
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 6,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignSelf: "flex-start",
    maxWidth: "85%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  disc: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#A1A1AA",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
    flex: 1,
  },
  playBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

export default React.memo(SoundtrackBadge);
