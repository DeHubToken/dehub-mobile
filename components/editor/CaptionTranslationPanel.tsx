import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES } from "../../i18n";
import { translateText } from "../../services/translation.service";
import { captionTranslationKey, planCaptionTranslation, translateCaptionPlan, type CaptionTranslationPlan, type CaptionTranslationUpdate } from "../../libs/editor/captionTranslation";
import { subtitleClips } from "../../libs/editor/subtitles";
import type { ProjectSnapshot } from "../../libs/editor/types";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";

export interface CaptionTranslationActions {
  current: () => ProjectSnapshot | null;
  subscribe: (observer: () => void) => () => void;
  onStart: () => ProjectEditLease | null;
  onApply: (plan: CaptionTranslationPlan, updates: CaptionTranslationUpdate[]) => boolean;
}

export default function CaptionTranslationPanel({ project, disabled, onBusyChange, current, subscribe, onStart, onApply }: CaptionTranslationActions & {
  project: ProjectSnapshot; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [language, setLanguage] = useState(() => SUPPORTED_LANGUAGES.find(item => item.code === i18n.language?.split(/[-_]/)[0])?.code ?? "en");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const active = useRef<{ controller: AbortController; lease: ProjectEditLease; sourceKey: string; projectId: string; applying: boolean } | null>(null);
  const mounted = useRef(true);
  const actions = useRef({ current, subscribe, onStart, onApply, onBusyChange });
  actions.current = { current, subscribe, onStart, onApply, onBusyChange };
  const captions = subtitleClips(project.clips, project.tracks);
  const count = captions.filter(clip => !clip.locked && clip.text.trim()).length;
  const cancel = () => {
    const job = active.current;
    if (!job) return;
    active.current = null;
    job.controller.abort(); job.lease.release();
    if (mounted.current) { setProgress(null); actions.current.onBusyChange(false); }
  };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = actions.current.subscribe(() => {
      const job = active.current, now = actions.current.current();
      if (job && !job.applying && (!job.lease.isCurrent() || !now || now.id !== job.projectId || captionTranslationKey(now) !== job.sourceKey)) cancel();
    });
    return () => { mounted.current = false; unsubscribe(); cancel(); };
  }, []);
  const start = async () => {
    const source = actions.current.current();
    if (disabled || active.current || !count || !source || source.id !== project.id) return;
    let plan: CaptionTranslationPlan;
    try { plan = planCaptionTranslation(source); }
    catch { setStatus(t("editor.captions.translationFailed", { defaultValue: "Caption translation failed. Your captions are unchanged." })); return; }
    const lease = actions.current.onStart();
    if (!lease) return;
    const controller = new AbortController(), job = { controller, lease, sourceKey: plan.sourceKey, projectId: source.id, applying: false };
    active.current = job; setStatus(null); actions.current.onBusyChange(true); setProgress({ done: 0, total: plan.cues.length });
    try {
      const updates = await translateCaptionPlan(plan, language, {
        signal: controller.signal,
        translate: async (text, targetLang) => (await translateText(text, targetLang, "auto", { isPublic: false })).translatedText,
        onProgress: (done, total) => { if (active.current === job) setProgress({ done, total }); },
      });
      const now = actions.current.current();
      if (active.current !== job || controller.signal.aborted || !lease.isCurrent() || now?.id !== job.projectId) return;
      job.applying = true;
      if (!actions.current.onApply(plan, updates)) throw new Error("Caption translation changed");
      if (mounted.current) setStatus(t("editor.captions.translationDone", { defaultValue: "Translated {{count}} captions", count: updates.length }));
    } catch {
      if (active.current === job && !controller.signal.aborted && mounted.current) setStatus(t("editor.captions.translationFailed", { defaultValue: "Caption translation failed. Your captions are unchanged." }));
    } finally {
      lease.release();
      if (active.current === job) { active.current = null; if (mounted.current) { setProgress(null); actions.current.onBusyChange(false); } }
    }
  };
  return <View className="border-t border-white/10 pt-3" style={{ gap: 8 }}>
    <Text className="text-white">{t("editor.captions.targetLanguage", { defaultValue: "Caption language" })}</Text>
    <View className="rounded-xl border border-white/10 bg-black">
      <Picker accessibilityLabel={t("editor.captions.targetLanguage", { defaultValue: "Caption language" })} selectedValue={language} enabled={!disabled && !progress} onValueChange={value => setLanguage(String(value))} style={{ color: "#ffffff" }} dropdownIconColor="#ffffff">
        {SUPPORTED_LANGUAGES.map(item => <Picker.Item key={item.code} value={item.code} label={`${item.nativeName} · ${item.name}`} color="#ffffff" />)}
      </Picker>
    </View>
    <Pressable accessibilityRole="button" disabled={disabled || !count || !!progress} onPress={() => { void start(); }} className="rounded-xl border border-white/10 px-4 py-3" style={{ opacity: count && !disabled && !progress ? 1 : 0.4 }}>
      <Text className="text-white">{t("editor.captions.translateCount", { defaultValue: "Translate {{count}} captions", count })}</Text>
    </Pressable>
    {captions.some(clip => clip.locked) && <Text className="text-theme-neutrals-400">{t("editor.captions.lockedTranslation", { defaultValue: "Unlock locked captions to include them." })}</Text>}
    {progress && <View className="flex-row items-center justify-between">
      <Text accessibilityLiveRegion="polite" className="text-white">{progress.done} / {progress.total}</Text>
      <Pressable accessibilityRole="button" onPress={cancel} className="px-4 py-3"><Text className="text-white">{t("common.cancel")}</Text></Pressable>
    </View>}
    {status && <Text accessibilityLiveRegion="polite" className="text-theme-neutrals-400">{status}</Text>}
  </View>;
}
