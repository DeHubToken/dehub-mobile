import React, { useCallback, useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, Animated, Easing } from "react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";

interface Props {
  title: string;
  creator: string;
  url: string;
}

const SoundtrackBadge: React.FC<Props> = ({ title, creator, url }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);
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

  const stopPlayback = useCallback(async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {}
    soundRef.current = null;
    setIsPlaying(false);
    releaseAudioFocus(stopPlayback);
  }, []);

  const togglePlay = useCallback(async () => {
    if (isLoading) return;

    // Already playing — pause
    if (isPlaying && soundRef.current) {
      await soundRef.current.pauseAsync().catch(() => {});
      setIsPlaying(false);
      releaseAudioFocus(stopPlayback);
      return;
    }

    // Resume from pause
    if (!isPlaying && soundRef.current) {
      const status = await soundRef.current.getStatusAsync().catch(() => null);
      if (status?.isLoaded) {
        requestAudioFocus(stopPlayback);
        await soundRef.current.playAsync().catch(() => {});
        setIsPlaying(true);
        return;
      }
    }

    // Fresh load
    setIsLoading(true);
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });
      requestAudioFocus(stopPlayback);
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, isLooping: true }
      );
      soundRef.current = sound;
      setIsPlaying(true);
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) {
          setIsPlaying(false);
          releaseAudioFocus(stopPlayback);
        }
      });
    } catch (e) {
      console.warn("[SoundtrackBadge] Playback error:", e);
      releaseAudioFocus(stopPlayback);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, isPlaying, url, stopPlayback]);

  // Unload on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      soundRef.current = null;
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
    backgroundColor: "#7C3AED",
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
