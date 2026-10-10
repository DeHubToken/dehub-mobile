import React, { useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { RecordingPresets, useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { acquireRecordingAudio } from "../../libs/editor/recordingAudioSession";
import { projectTask } from "../../libs/editor/projectTask";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
import { runWithPermissions } from "../../libs/permissions.util";
import { importClipFile, type MediaMeta } from "../../libs/editor/storage";
import Icon from "../ui/Icon";

type Take = { task: NonNullable<ReturnType<typeof projectTask>>; mode: "audio" | "camera"; at: number; active: boolean; cancelled: boolean; started: number; closeAudio: (() => Promise<void>) | null };

export default function RecordingPanel({ at, scope, onAdd, onStart }: { at: number; scope: number; onAdd: (media: MediaMeta, start: number) => void; onStart: () => ProjectEditLease | null }) {
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const take = useRef<Take | null>(null), mounted = useRef(true);
  const currentScope = useRef(scope); currentScope.current = scope;
  const add = useRef(onAdd); add.current = onAdd;
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [seconds, setSeconds] = useState(0), [status, setStatus] = useState<string | null>(null);
  const finish = (owner: Take) => {
    if (take.current === owner) {
      take.current = null;
      if (mounted.current) { setRecording(false); setBusy(false); }
    }
    owner.task.release();
  };
  const stop = async (cancel = false) => {
    const owner = take.current;
    if (!owner || owner.mode !== "audio") return;
    owner.cancelled ||= cancel;
    if (cancel) owner.task.release();
    if (!owner.active) return;
    owner.active = false;
    if (mounted.current) { setRecording(false); setBusy(true); }
    try {
      const duration = Math.min(600, (Date.now() - owner.started) / 1000);
      await recorder.stop();
      const uri = recorder.uri;
      if (!owner.cancelled && uri && duration >= 0.25 && owner.task.isCurrent()) {
        const media = await importClipFile({ uri, kind: "audio", fileName: `voiceover-${Date.now()}.m4a`, duration });
        if (owner.task.isCurrent()) add.current(media, owner.at);
      }
    } catch { if (owner.task.isCurrent()) setStatus(t("common.somethingWentWrong")); }
    finally { await owner.closeAudio?.().catch(() => {}); finish(owner); }
  };
  const stopRef = useRef(stop); stopRef.current = stop;
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", state => { if (state !== "active") void stopRef.current(true); });
    return () => { mounted.current = false; subscription.remove(); take.current?.task.release(); void stopRef.current(true); };
  }, []);
  useEffect(() => () => { take.current?.task.release(); void stopRef.current(true); }, [scope]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const owner = take.current;
      if (!owner) return;
      const elapsed = (Date.now() - owner.started) / 1000;
      setSeconds(elapsed); if (elapsed >= 600) void stopRef.current();
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);
  const begin = (mode: Take["mode"]) => {
    if (take.current) return null;
    const capturedScope = scope;
    const task = projectTask(onStart(), () => mounted.current && currentScope.current === capturedScope);
    if (!task) return null;
    const owner: Take = { task, mode, at, active: false, cancelled: false, started: 0, closeAudio: null };
    take.current = owner; setBusy(true); setStatus(null); return owner;
  };
  const start = async () => {
    const owner = begin("audio"); if (!owner) return;
    try {
      let granted = false;
      await runWithPermissions(["microphone"], async () => { granted = true; });
      if (!granted || !owner.task.isCurrent() || AppState.currentState !== "active") return;
      owner.closeAudio = await acquireRecordingAudio(() => owner.task.isCurrent() && AppState.currentState === "active");
      if (!owner.closeAudio) return;
      await recorder.prepareToRecordAsync();
      if (!owner.task.isCurrent() || AppState.currentState !== "active") return;
      recorder.record(); owner.active = true; owner.started = Date.now(); setSeconds(0); setRecording(true); setBusy(false);
    } catch { if (owner.task.isCurrent()) setStatus(t("common.somethingWentWrong")); }
    finally {
      if (!owner.active) { await owner.closeAudio?.().catch(() => {}); finish(owner); }
    }
  };
  const camera = async () => {
    const owner = begin("camera"); if (!owner) return;
    try {
      await runWithPermissions(["camera", "microphone"], async () => {
        if (!owner.task.isCurrent()) return;
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["videos"], videoMaxDuration: 180, quality: 1 });
        if (result.canceled || !result.assets[0] || !owner.task.isCurrent()) return;
        const asset = result.assets[0];
        const media = await importClipFile({ uri: asset.uri, kind: "video", fileName: asset.fileName ?? `camera-${Date.now()}.mp4`, width: asset.width, height: asset.height, duration: asset.duration ? asset.duration / 1000 : undefined });
        if (owner.task.isCurrent()) add.current(media, owner.at);
      });
    } catch { if (owner.task.isCurrent()) setStatus(t("common.somethingWentWrong")); }
    finally { finish(owner); }
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
