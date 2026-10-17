import CompositionBrandFonts from "./CompositionBrandFonts";
import TextCompositionPreview from "./TextCompositionPreview";
import React, { useMemo, useState } from "react";
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
  const [headingFont, setHeadingFont] = useState<string | null>(null), [bodyFont, setBodyFont] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [chosenPreset, setPreset] = useState<TextCompositionId>("editorial");
  const content = useMemo(() => title.trim() && [colour, accent].every(value => /^#[a-f0-9]{6}$/i.test(value)) ? { title, subtitle, eyebrow, colour, accent, headingFont, bodyFont } : null, [title, subtitle, eyebrow, colour, accent, headingFont, bodyFont]);
  const insert = (id: TextCompositionId) => {
    const latest = current(); if (!latest || latest.id !== project.id) return;
    const result = putTextComposition(latest, time, id, { title, subtitle, eyebrow, colour, accent, headingFont, bodyFont }, () => newId(10));
    if (result) { commit(result.project); select(result.id); setError(""); } else setError(t("editor.compositions.limit", { defaultValue: "This combination exceeds the design’s layer or size limits." }));
  };
  return <View className="px-3" style={{ gap: 10 }}>
    {[{ value: title, set: setTitle, label: t("editor.compositions.heading", { defaultValue: "Heading" }) }, { value: subtitle, set: setSubtitle, label: t("editor.compositions.subtitle", { defaultValue: "Supporting text" }) }, { value: eyebrow, set: setEyebrow, label: t("editor.compositions.eyebrow", { defaultValue: "Eyebrow" }) }].map(field => <View key={field.label} style={{ gap: 4 }}><Text className="text-xs text-white/60">{field.label}</Text><TextInput value={field.value} onChangeText={field.set} accessibilityLabel={field.label} maxLength={2000} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View>)}
    <View className="flex-row" style={{ gap: 8 }}><TextInput value={colour} onChangeText={setColour} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.compositions.colour", { defaultValue: "Text colour" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" /><TextInput value={accent} onChangeText={setAccent} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.compositions.accent", { defaultValue: "Accent colour" })} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" /></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{TEXT_COMPOSITIONS.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityState={{ selected: chosenPreset === preset.id }} onPress={() => setPreset(preset.id)} className={`min-h-[64px] justify-center rounded-xl border p-3 ${chosenPreset === preset.id ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`} style={{ width: "48%", opacity: 1 }}><Text className="text-sm font-semibold text-white">{t(`editor.compositions.${preset.id}`, { defaultValue: preset.label })}</Text><Text className="text-xs text-white/45">{preset.heading} + {preset.body}</Text></Pressable>)}</View>
    {!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
    <CompositionBrandFonts headingFont={headingFont} bodyFont={bodyFont} onApply={(heading, body) => { setHeadingFont(heading); setBodyFont(body); setError(""); }} />
    <TextCompositionPreview projectId={project.id} preset={chosenPreset} value={content} width={project.settings.width} height={project.settings.height} background={project.settings.background} />
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid }} disabled={!valid} onPress={() => insert(chosenPreset)} className="min-h-[44px] self-start justify-center rounded-lg bg-white px-3" style={{ opacity: valid ? 1 : 0.35 }}><Text className="text-xs font-semibold text-black">{t("editor.compositions.insertSelected", { defaultValue: "Insert selected combination" })}</Text></Pressable>
  </View>;
}
