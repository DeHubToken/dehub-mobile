import React, { useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { RecordingPresets, useAudioRecorder } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { acquireRecordingAudio } from "../../libs/editor/recordingAudioSession";
import { projectTask } from "../../libs/editor/projectTask";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
import { runWithPermissions } from "../../libs/permissions.util";
import { importClipFile, type MediaMeta } from "../../libs/editor/storage";
import Icon from "../ui/Icon";
import { newId } from "../../libs/editor/project";
import { ownScreenCapture } from "../../libs/editor/screenCaptureOwnership";
import { recoverScreenCaptures, screenCaptureCapabilities, screenCaptureDriver, type CaptureCapabilities, type CaptureState } from "../../modules/screen-capture";

type ScreenTake = { capture: ReturnType<typeof ownScreenCapture>; bridge: ReturnType<typeof screenCaptureDriver>; id: string; unsubscribe: () => void };
type Take = { task: NonNullable<ReturnType<typeof projectTask>>; mode: "audio" | "camera" | "screen"; at: number; active: boolean; stopping: boolean; cancelled: boolean; started: number; closeAudio: (() => Promise<void>) | null; screen?: ScreenTake };

export default function RecordingPanel({ at, scope, recordingScope, subscribe, onAdd, onStart }: { at: number; scope: number; recordingScope: string; subscribe: (changed: () => void) => () => void; onAdd: (media: MediaMeta, start: number) => void; onStart: () => ProjectEditLease | null }) {
  const { t } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const take = useRef<Take | null>(null), mounted = useRef(true);
  const currentScope = useRef(scope); currentScope.current = scope;
  const accountProject = useRef(recordingScope); accountProject.current = recordingScope;
  const add = useRef(onAdd); add.current = onAdd;
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [seconds, setSeconds] = useState(0), [status, setStatus] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null), [voiceover, setVoiceover] = useState(false), [systemAudio, setSystemAudio] = useState(true), [recovered, setRecovered] = useState<CaptureState[]>([]);
  const finish = (owner: Take) => {
    owner.screen?.unsubscribe();
    if (take.current === owner) {
      take.current = null;
      if (mounted.current) { setRecording(false); setBusy(false); }
    }
    owner.task.release();
  };
  const stop = async (cancel = false) => {
    const owner = take.current;
    if (!owner || owner.mode === "camera") return;
    owner.cancelled ||= cancel;
    if (cancel) owner.task.release();
    if (owner.mode === "screen") {
      if (!owner.screen || (!owner.active && !cancel)) return;
      owner.stopping = true;
      owner.active = false;
      if (mounted.current) { setRecording(false); setBusy(true); }
      try {
        if (cancel) { await owner.screen.capture.cancel(); return; }
        const result = await owner.screen.capture.save();
        if (result && owner.task.isCurrent()) {
          const media = await importClipFile({ uri: result.uri, kind: "video", fileName: `screen-${owner.screen.id}.mp4`, width: result.width, height: result.height, duration: result.durationMs / 1000 });
          if (owner.task.isCurrent()) {
            add.current(media, owner.at);
            await Promise.resolve(owner.screen.bridge.acknowledge(owner.screen.id)).catch(() => owner.screen!.capture.cancel());
          } else { await owner.screen.capture.cancel(); }
        }
      } catch {
        if (owner.task.isCurrent()) {
          setStatus(t("common.somethingWentWrong"));
          const capturedAccountProject = accountProject.current, capturedVersion = currentScope.current;
          void recoverScreenCaptures(capturedAccountProject).then(value => {
            if (mounted.current && accountProject.current === capturedAccountProject && currentScope.current === capturedVersion) setRecovered(value);
          }).catch(() => {});
        }
      }
      finally { finish(owner); }
      return;
    }
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
    const subscription = AppState.addEventListener("change", state => {
      const owner = take.current;
      if (state !== "active" && owner?.mode === "audio") void stopRef.current(true);
      if (state === "active" && owner?.screen) void owner.screen.bridge.status(owner.screen.id).then(value => {
        if (take.current === owner && value?.state === "completed") void stopRef.current();
      }).catch(() => {});
    });
    const unsubscribe = subscribe(() => {
      const owner = take.current;
      if (owner && !owner.task.isCurrent()) { owner.task.release(); void stopRef.current(true); }
    });
    return () => { mounted.current = false; subscription.remove(); unsubscribe(); take.current?.task.release(); void stopRef.current(true); };
  }, []);
  useEffect(() => () => { take.current?.task.release(); void stopRef.current(true); }, [scope, recordingScope]);
  useEffect(() => {
    let current = true; setRecovered([]);
    void screenCaptureCapabilities().then(value => { if (current) setCapabilities(value); });
    void recoverScreenCaptures(recordingScope).then(value => { if (current) setRecovered(value); }).catch(() => {});
    return () => { current = false; };
  }, [recordingScope]);
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
  const begin = (mode: Take["mode"], playhead = at) => {
    if (take.current) return null;
    const capturedScope = scope;
    const originalScope = recordingScope;
    const task = projectTask(onStart(), () => mounted.current && currentScope.current === capturedScope && accountProject.current === originalScope);
    if (!task) return null;
    const owner: Take = { task, mode, at: playhead, active: false, stopping: false, cancelled: false, started: 0, closeAudio: null };
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
  const screen = async (restore?: CaptureState) => {
    const owner = begin("screen", restore ? restore.playheadMs / 1000 : at); if (!owner) return;
    try {
      if (!capabilities?.available && !restore) return;
      let granted = !!restore || !(voiceover || (Platform.OS === "android" && capabilities?.systemAudio && systemAudio));
      if (!granted) await runWithPermissions(["microphone"], async () => { granted = true; });
      if (!granted || !owner.task.isCurrent()) return;
      const bridge = screenCaptureDriver({ scope: recordingScope, playhead: owner.at, systemAudio: systemAudio && !!capabilities?.systemAudio, title: t("common.recordVideo"), save: t("common.save"), cancel: t("common.cancel") }, restore);
      const id = restore?.sessionId ?? newId(16);
      const capture = ownScreenCapture(bridge.driver, { sessionId: id, microphone: voiceover }, () => owner.task.isCurrent());
      owner.screen = { bridge, id, capture, unsubscribe: () => {} };
      const subscription = bridge.subscribe(id, value => {
        if (take.current !== owner || !owner.active) return;
        if (value.state === "completed") void stopRef.current();
        if (value.state === "failed" || value.state === "cancelled") {
          if (value.state === "failed" && owner.task.isCurrent()) setStatus(t("common.somethingWentWrong"));
          void stopRef.current(true);
        }
      });
      owner.screen.unsubscribe = () => subscription.remove();
      if (!await capture.ready || !owner.task.isCurrent()) return;
      owner.active = true; owner.started = Date.now(); setSeconds(0); setRecording(true); setBusy(false);
      if (restore) {
        setRecovered(old => old.filter(value => value.sessionId !== id));
        await stopRef.current();
      } else if ((await bridge.status(id))?.state === "completed") { await stopRef.current(); }
    } catch { if (owner.task.isCurrent()) setStatus(t("common.somethingWentWrong")); }
    finally { if (!owner.active && !owner.stopping) finish(owner); }
  };
  return <View style={{ gap: 12 }}>
    {recording ? <View className="flex-row items-center" style={{ gap: 12 }}>
      <Text className="text-white tabular-nums">{Math.floor(seconds / 60)}:{String(Math.floor(seconds) % 60).padStart(2, "0")}</Text>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void stop(); }} className="rounded-xl bg-white px-4 py-3"><Text className="text-black">{t("common.save")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void stop(true); }}><Text className="text-white">{t("common.cancel")}</Text></Pressable>
    </View> : <View className="flex-row" style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void start(); }} className="flex-1 items-center rounded-xl bg-white/10 px-4 py-3"><Icon name="Mic" size={22} color="#fff" /><Text className="text-white">{t("comments.recordVoice")}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void camera(); }} className="flex-1 items-center rounded-xl bg-white/10 px-4 py-3"><Icon name="Camera" size={22} color="#fff" /><Text className="text-white">{t("common.recordVideo")}</Text></Pressable>
      {capabilities?.available && <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void screen(); }} className="flex-1 items-center rounded-xl bg-white/10 px-4 py-3"><Icon name="Monitor" size={22} color="#fff" /><Text className="text-white">{t("editor.blend.screen")}</Text></Pressable>}
    </View>}
    {!recording && capabilities?.available && <View className="flex-row" style={{ gap: 16 }}>
      {capabilities.systemAudio && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: systemAudio, disabled: busy }} disabled={busy} onPress={() => setSystemAudio(value => !value)}><Text className="text-white">{systemAudio ? "☑" : "☐"} {t("creator.navAudio")}</Text></Pressable>}
      {capabilities.microphone && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: voiceover, disabled: busy }} disabled={busy} onPress={() => setVoiceover(value => !value)}><Text className="text-white">{voiceover ? "☑" : "☐"} {t("comments.recordVoice")}</Text></Pressable>}
    </View>}
    {!recording && recovered.map(value => <Pressable key={value.sessionId} accessibilityRole="button" disabled={busy} onPress={() => { void screen(value); }}><Text className="text-white">{t("editor.cloud.restore")} · {t("editor.blend.screen")} {Math.floor(value.playheadMs / 60000)}:{String(Math.floor(value.playheadMs / 1000) % 60).padStart(2, "0")}</Text></Pressable>)}
    {status && <Text className="text-theme-neutrals-400">{status}</Text>}
  </View>;
}
