import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TouchableOpacity, View, Text, StyleSheet, ActivityIndicator, AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { createAudioPlayer } from "expo-audio";
import { usePostAudioSession } from "../../hooks/usePostAudioSession";
import { postMediaIsTransferring } from "../../libs/post-media-session";
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
  const { session, ownsPlayer, active: ownsAudio } = usePostAudioSession(url);
  const [, refresh] = useState(0);
  const player = session.value;
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
    if (!ownsPlayer() || postMediaIsTransferring(session)) return;
    wanted.current = false;
    confirmed.current = false;
    generation.current++;
    clearLoadingTimeout();
    try { session.value?.pause(); } catch { /* Player may already be released. */ }
    setPlaying(false);
    setLoading(false);
    releaseAudioFocus(pause);
  }, [session, ownsPlayer, clearLoadingTimeout]);

  useLayoutEffect(() => {
    if (!ownsAudio) {
      wanted.current = false;
      confirmed.current = false;
      generation.current++;
      clearLoadingTimeout();
      return;
    }
    if (!player || wanted.current) return;
    wanted.current = player.playing;
    confirmed.current = player.playing;
    loadedUrl.current = url;
    setPlaying(player.playing);
    setLoading(false);
    if (player.playing) requestAudioFocus(pause);
  }, [ownsAudio, player, url, pause, clearLoadingTimeout]);

  const fail = useCallback(() => {
    pause();
    loadedUrl.current = null;
    setError(true);
  }, [pause]);

  useEffect(() => {
    if (!player || !ownsAudio) return;
    player.loop = true;
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!ownsPlayer()) return;
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
    return () => { subscription.remove(); clearLoadingTimeout(); releaseAudioFocus(pause); };
  }, [player, ownsAudio, ownsPlayer, pause, fail, clearLoadingTimeout]);

  useEffect(() => {
    setError(false);
  }, [url]);

  useEffect(() => { if (!isVisible || !focused) pause(); }, [isVisible, focused, pause]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => { if (state !== "active") pause(); });
    return () => subscription.remove();
  }, [pause]);

  const toggle = useCallback(async () => {
    if (wanted.current) { pause(); return; }
    if (!ownsPlayer() || !active.current || AppState.currentState !== "active") return;
    const attempt = ++generation.current;
    wanted.current = true;
    setLoading(true);
    setError(false);
    // Claim before awaiting setup, so another tap can cancel this request.
    requestAudioFocus(pause);
    timeout.current = setTimeout(fail, 15000);
    try {
      await configureForDuckedPlayback();
      if (!ownsPlayer() || generation.current !== attempt || !wanted.current || !active.current) return;
      let audio = session.value;
      if (!audio) {
        audio = createAudioPlayer({ uri: url });
        session.value = audio;
        loadedUrl.current = url;
        refresh(version => version + 1);
      }
      if (loadedUrl.current !== url) {
        audio.replace({ uri: url });
        loadedUrl.current = url;
      }
      audio.loop = true;
      audio.play();
    } catch {
      if (generation.current === attempt) fail();
    }
  }, [url, session, ownsPlayer, pause, fail]);

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
