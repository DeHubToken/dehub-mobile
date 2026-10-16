import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { putTextComposition, TEXT_COMPOSITIONS, type TextCompositionId } from "../../libs/editor/textCompositions";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function TextCompositionsPanel({ project, current, commit, time, select }: {
  project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (value: ProjectSnapshot) => void; time: number; select: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(t("editor.compositions.sampleTitle", { defaultValue: "Make something memorable" }));
  const [subtitle, setSubtitle] = useState(t("editor.compositions.sampleSubtitle", { defaultValue: "Your story starts here." }));
  const [eyebrow, setEyebrow] = useState(t("editor.compositions.sampleEyebrow", { defaultValue: "A fresh perspective" }));
  const [colour, setColour] = useState("#ffffff"), [accent, setAccent] = useState("#38bdf8");
  const valid = !!title.trim() && /^#[\da-f]{6}$/i.test(colour) && /^#[\da-f]{6}$/i.test(accent);
  const insert = (id: TextCompositionId) => {
    const latest = current(); if (!latest || latest.id !== project.id) return;
    const result = putTextComposition(latest, time, id, { title, subtitle, eyebrow, colour, accent }, () => newId(10));
    if (result) { commit(result.project); select(result.id); }
  };
  return <View className="px-3" style={{ gap: 10 }}>
    {[{ value: title, set: setTitle, label: t("editor.compositions.heading", { defaultValue: "Heading" }) }, { value: subtitle, set: setSubtitle, label: t("editor.compositions.subtitle", { defaultValue: "Supporting text" }) }, { value: eyebrow, set: setEyebrow, label: t("editor.compositions.eyebrow", { defaultValue: "Eyebrow" }) }].map(field => <View key={field.label} style={{ gap: 4 }}><Text className="text-xs text-white/60">{field.label}</Text><TextInput value={field.value} onChangeText={field.set} accessibilityLabel={field.label} maxLength={2000} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View>)}
    <View className="flex-row" style={{ gap: 8 }}><TextInput value={colour} onChangeText={setColour} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.compositions.colour", { defaultValue: "Text colour" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" /><TextInput value={accent} onChangeText={setAccent} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.compositions.accent", { defaultValue: "Accent colour" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" /></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{TEXT_COMPOSITIONS.map(preset => <Pressable key={preset.id} accessibilityRole="button" disabled={!valid} onPress={() => insert(preset.id)} className="min-h-[64px] justify-center rounded-xl border border-white/20 p-3" style={{ width: "48%", opacity: valid ? 1 : 0.35 }}><Text className="text-sm font-semibold text-white">{t(`editor.compositions.${preset.id}`, { defaultValue: preset.label })}</Text><Text className="text-xs text-white/45">{preset.heading} + {preset.body}</Text></Pressable>)}</View>
  </View>;
}
