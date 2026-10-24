import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { ANIMATION_PRESETS } from "../../libs/editor/animationPresets";
import { applyPageAnimation, type PageAnimationEdge, type PageAnimationScope } from "../../libs/editor/pageAnimations";
import { newId } from "../../libs/editor/project";
import type { ClipAnimationKind, ProjectSnapshot } from "../../libs/editor/types";

export default function PageAnimationPanel({ project, time, selectedId, current, commit }: {
  project: ProjectSnapshot; time: number; selectedId: string | null;
  current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void;
}) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<PageAnimationScope>("page"), [edge, setEdge] = useState<PageAnimationEdge>("in");
  const [kind, setKind] = useState<ClipAnimationKind | "none">("fade"), [duration, setDuration] = useState("0.6");
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  const apply = () => {
    try {
      const latest = current(); if (!latest || latest.id !== project.id) return;
      const result = applyPageAnimation(latest, time, selectedId ? [selectedId] : [], { scope, edge, kind, duration: Number(duration) }, () => newId(10));
      if (result.project !== latest) commit(result.project);
      setError(""); setMessage(result.count ? t("editor.pageAnimation.updated", { defaultValue: "Updated {{count}} layers", count: result.count }) : t("editor.pageAnimation.noChange", { defaultValue: "No editable layers needed changing" }));
    } catch (value) { setError(value instanceof Error ? value.message : "Could not apply animation"); }
  };
  const chip = (label: string, active: boolean, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={() => { onPress(); setMessage(""); }} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className={`text-xs ${active ? "text-black" : "text-white/75"}`}>{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.pageAnimation.hint", { defaultValue: "Apply coordinated entrance or exit motion to a page or selection. Locked and hidden layers stay unchanged. Images and PDFs still export the complete artwork." })}</Text>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["page", "all", "selection"] as const).map(value => chip(t(`editor.pageAnimation.scope.${value}`, { defaultValue: ({ page: "This page", all: "Every page", selection: "Selected layers" })[value] }), scope === value, () => setScope(value), value === "selection" && !selectedId))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["in", "out", "both"] as const).map(value => chip(t(`editor.pageAnimation.edge.${value}`, { defaultValue: ({ in: "On enter", out: "On exit", both: "Enter and exit" })[value] }), edge === value, () => setEdge(value)))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{chip(t("editor.pageAnimation.none", { defaultValue: "None" }), kind === "none", () => setKind("none"))}{ANIMATION_PRESETS.map(preset => chip(t(`editor.animation.${preset.kind}`, { defaultValue: preset.label }), kind === preset.kind, () => setKind(preset.kind)))}</View>
    {kind !== "none" && <View style={{ gap: 4 }}><Text className="text-xs text-white/65">{t("editor.pageAnimation.duration", { defaultValue: "Duration in seconds" })}</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="decimal-pad" accessibilityLabel={t("editor.pageAnimation.duration", { defaultValue: "Duration in seconds" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View>}
    {kind === "typewriter" && <Text className="text-xs text-white/45">{t("editor.pageAnimation.typewriterHint", { defaultValue: "Text types on; other layers fade. Durations fit within each layer’s timing." })}</Text>}
    <Pressable accessibilityRole="button" disabled={scope === "selection" && !selectedId} onPress={apply} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3" style={{ opacity: scope === "selection" && !selectedId ? 0.35 : 1 }}><Text className="text-xs font-medium text-black">{t("editor.pageAnimation.apply", { defaultValue: "Apply animation" })}</Text></Pressable>
    {message && <Text accessibilityLiveRegion="polite" className="text-xs text-white/60">{message}</Text>}{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
