import React, { useCallback, useEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, ActivityIndicator, AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { useAudioPlayer } from "expo-audio";
import { Ionicons } from "@expo/vector-icons";
import { requestAudioFocus, releaseAudioFocus } from "../../libs/audioFocus";
import { configureForDuckedPlayback } from "../../libs/audioSession";

interface Props {
  title: string;
  creator: string;
  url: string;
  isVisible?: boolean;
}

const SoundtrackBadge: React.FC<Props> = ({ title, creator, url, isVisible = true }) => {
  const { t } = useTranslation();
  const focused = useIsFocused();
  const player = useAudioPlayer(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const wanted = useRef(false);
  const confirmed = useRef(false);
  const generation = useRef(0);
  const loadedUrl = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);
  active.current = isVisible && focused;

  const clearLoadingTimeout = useCallback(() => {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
  }, []);

  const pause = useCallback(() => {
    wanted.current = false;
    confirmed.current = false;
    generation.current++;
    clearLoadingTimeout();
    try { player.pause(); } catch { /* Player may already be released. */ }
    setPlaying(false);
    setLoading(false);
    releaseAudioFocus(pause);
  }, [player, clearLoadingTimeout]);

  const fail = useCallback(() => {
    pause();
    loadedUrl.current = null;
    setError(true);
  }, [pause]);

  useEffect(() => {
    player.loop = true;
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!wanted.current) return;
      if (status.playbackState === "error" || status.playbackState === "failed") { fail(); return; }
      const buffering = !status.isLoaded || status.isBuffering;
      if (confirmed.current && !status.playing && !buffering) { pause(); return; }
      if (status.playing && !buffering) confirmed.current = true;
      setLoading(buffering || !confirmed.current);
      setPlaying(status.playing && !buffering);
      if (status.playing && !buffering) clearLoadingTimeout();
      else if (buffering && !timeout.current) timeout.current = setTimeout(fail, 15000);
    });
    return () => { subscription.remove(); pause(); };
  }, [player, pause, fail, clearLoadingTimeout]);

  useEffect(() => {
    pause();
    loadedUrl.current = null;
    setError(false);
  }, [url, pause]);

  useEffect(() => { if (!isVisible || !focused) pause(); }, [isVisible, focused, pause]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") pause(); });
    return () => subscription.remove();
  }, [pause]);

  const toggle = useCallback(async () => {
    if (wanted.current) { pause(); return; }
    if (!active.current || AppState.currentState !== "active") return;
    const attempt = ++generation.current;
    wanted.current = true;
    setLoading(true);
    setError(false);
    // Claim before awaiting setup, so another tap can cancel this request.
    requestAudioFocus(pause);
    timeout.current = setTimeout(fail, 15000);
    try {
      await configureForDuckedPlayback();
      if (generation.current !== attempt || !wanted.current || !active.current) return;
      if (loadedUrl.current !== url) {
        player.replace({ uri: url });
        player.loop = true;
        loadedUrl.current = url;
      }
      player.play();
    } catch {
      if (generation.current === attempt) fail();
    }
  }, [url, player, pause, fail]);

  const action = error ? t("common.retry") : loading ? t("common.cancel") : playing ? t("audioPost.pause") : t("audioPost.play");
  const name = title || t("feed.music");
  return (
    <TouchableOpacity
      onPress={(event) => { event.stopPropagation(); void toggle(); }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${action}: ${name}${creator ? ` — ${creator}` : ""}`}
      style={styles.container}
    >
      <Ionicons name="musical-note" size={17} color="rgba(255,255,255,0.75)" />
      <View style={styles.metadata}>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        {!!creator && <Text style={styles.creator} numberOfLines={1}>{creator}</Text>}
      </View>
      {loading ? <ActivityIndicator size="small" color="#fff" /> : (
        <Ionicons name={error ? "refresh" : playing ? "pause" : "play"} size={17} color="#fff" />
      )}
      <Text style={styles.action}>{loading ? t("common.loading") : action}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8, minHeight: 44, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.75)", alignSelf: "flex-start", maxWidth: "100%", borderWidth: 1, borderColor: "rgba(255,255,255,0.15)" },
  metadata: { flexShrink: 1 },
  title: { color: "#fff", fontSize: 12, fontWeight: "600" },
  creator: { color: "rgba(255,255,255,0.75)", fontSize: 11, marginTop: 2 },
  action: { color: "#fff", fontSize: 11, fontWeight: "500", flexShrink: 0 },
});

export default React.memo(SoundtrackBadge);
