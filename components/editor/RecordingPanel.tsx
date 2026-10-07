import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { RecordingPresets, useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { configureForRecording, releaseRecording } from "../../libs/audioSession";
import { runWithPermissions } from "../../libs/permissions.util";
import { importClipFile, type MediaMeta } from "../../libs/editor/storage";
import Icon from "../ui/Icon";

export default function RecordingPanel({ at, onAdd, onStart }: { at: number; onAdd: (media: MediaMeta, start: number) => void; onStart: () => void }) {
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const active = useRef(false), mounted = useRef(true), anchor = useRef(at), started = useRef(0);
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [seconds, setSeconds] = useState(0), [status, setStatus] = useState<string | null>(null);
  const stopRef = useRef<(cancel?: boolean) => Promise<void>>(async () => {});
  const stop = async (cancel = false) => {
    if (!active.current) return;
    active.current = false; if (mounted.current) { setRecording(false); setBusy(true); }
    try {
      const duration = Math.min(600, (Date.now() - started.current) / 1000);
      await recorder.stop();
      const uri = recorder.uri;
      if (!cancel && uri && duration >= 0.25 && mounted.current) {
        const media = await importClipFile({ uri, kind: "audio", fileName: `voiceover-${Date.now()}.m4a`, duration });
        if (mounted.current) onAdd(media, anchor.current);
      }
    } catch { if (mounted.current) setStatus(t("common.somethingWentWrong")); }
    finally { await releaseRecording().catch(() => {}); if (mounted.current) setBusy(false); }
  };
  stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") void stopRef.current(true); });
    return () => { mounted.current = false; subscription.remove(); void stopRef.current(true); };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => { const elapsed = (Date.now() - started.current) / 1000; setSeconds(elapsed); if (elapsed >= 600) void stopRef.current(); }, 250);
    return () => clearInterval(timer);
  }, [recording]);
  const start = async () => {
    if (busy || active.current) return;
    setBusy(true); setStatus(null); onStart(); anchor.current = at;
    try {
      let granted = false;
      await runWithPermissions(["microphone"], async () => { granted = true; });
      if (!granted || !mounted.current) return;
      await configureForRecording();
      await recorder.prepareToRecordAsync();
      if (!mounted.current || AppState.currentState !== "active") { await releaseRecording(); return; }
      recorder.record(); active.current = true; started.current = Date.now(); setSeconds(0); setRecording(true);
    } catch { await releaseRecording().catch(() => {}); if (mounted.current) setStatus(t("common.somethingWentWrong")); }
    finally { if (mounted.current) setBusy(false); }
  };
  const camera = async () => {
    if (busy || active.current) return;
    setBusy(true); setStatus(null); onStart(); const start = at;
    try {
      await runWithPermissions(["camera", "microphone"], async () => {
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 180, quality: 1 });
        if (result.canceled || !result.assets[0] || !mounted.current) return;
        const asset = result.assets[0];
        const media = await importClipFile({ uri: asset.uri, kind: "video", fileName: asset.fileName ?? `camera-${Date.now()}.mp4`, width: asset.width, height: asset.height, duration: asset.duration ? asset.duration / 1000 : undefined });
        if (mounted.current) onAdd(media, start);
      });
    } catch { if (mounted.current) setStatus(t("common.somethingWentWrong")); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <View style={{ gap: 12 }}>
    {recording ? <View className="flex-row items-center" style={{ gap: 12 }}>
      <Text className="text-white tabular-nums">{Math.floor(seconds / 60)}:{String(Math.floor(seconds) % 60).padStart(2, "0")}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void stop(); }} className="rounded-xl bg-white px-4 py-3"><Text className="text-black">{t("common.save")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void stop(true); }}><Text className="text-white">{t("common.cancel")}</Text></Pressable>
    </View> : <View className="flex-row" style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void start(); }} className="flex-1 items-center rounded-xl bg-white/10 px-4 py-3"><Icon name="Mic" size={22} color="#fff" /><Text className="text-white">{t("comments.recordVoice")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void camera(); }} className="flex-1 items-center rounded-xl bg-white/10 px-4 py-3"><Icon name="Camera" size={22} color="#fff" /><Text className="text-white">{t("common.recordVideo")}</Text></Pressable>
    </View>}
    {status && <Text className="text-theme-neutrals-400">{status}</Text>}
  </View>;
}
