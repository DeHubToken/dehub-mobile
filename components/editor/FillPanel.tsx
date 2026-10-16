import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GRADIENT_PRESETS, gradientFromColours, type GradientFill } from "../../libs/editor/gradientFill";
import { fillDesignLayers, putGradientBackground } from "../../libs/editor/fillProject";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function FillPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(c => c.id === selectedId);
  const gradient = selected && (selected.kind === "text" || selected.kind === "shape") ? selected.gradient : null;
  const [type, setType] = useState<GradientFill["type"]>("linear");
  const [angle, setAngle] = useState("45");
  const [first, setFirst] = useState("#2563eb"), [last, setLast] = useState("#22d3ee");
  useEffect(() => {
    if (!gradient?.stops?.length) return;
    setType(gradient.type); setAngle(String(gradient.angle)); setFirst(gradient.stops[0].colour); setLast(gradient.stops[gradient.stops.length - 1].colour);
  }, [selected?.id, gradient]);
  const valid = /^#[0-9a-f]{6}$/i.test(first) && /^#[0-9a-f]{6}$/i.test(last) && Number.isFinite(Number(angle)) && Number(angle) >= 0 && Number(angle) <= 360;
  const canFill = !!selected && !selected.locked && (selected.kind === "text" || (selected.kind === "shape" && !selected.chart && !selected.table));
  const apply = (value: GradientFill | null, background = false) => {
    const latest = current();
    if (!latest || latest.id !== project.id) return;
    const result = background && value ? putGradientBackground(latest, time, value, () => newId(10)) : null;
    const next = background ? result?.project : fillDesignLayers(latest, selectedId ? [selectedId] : [], value);
    if (next && next !== latest) { commit(next); if (result) select(result.id); }
  };
  const button = (text: string, onPress: () => void, disabled = false) => <Pressable key={text} accessibilityRole="button" disabled={disabled} onPress={onPress} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{text}</Text></Pressable>;
  return <ScrollView style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12 }}>
    <Text className="text-xs text-white/60">{t("editor.fills.hint", { defaultValue: "Apply a gradient to selected text or shapes, or add it behind this page." })}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{GRADIENT_PRESETS.map(preset => <Pressable key={preset.id} accessibilityRole="button" onPress={() => { setFirst(preset.colours[0]); setLast(preset.colours[preset.colours.length - 1]); apply(gradientFromColours(preset.colours, type, Number(angle) || 0), !canFill); }} className="rounded-lg border border-white/15 p-2" style={{ gap: 6 }}>
      <View className="flex-row overflow-hidden rounded">{preset.colours.map(colour => <View key={colour} style={{ width: 25, height: 24, backgroundColor: colour }} />)}</View><Text className="text-xs text-white">{t(`editor.fills.preset.${preset.id}`, { defaultValue: preset.label })}</Text>
    </Pressable>)}</ScrollView>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("editor.fills.linear", { defaultValue: "Linear" }), () => setType("linear"))}{button(t("editor.fills.radial", { defaultValue: "Radial" }), () => setType("radial"))}<Text className="self-center text-xs text-white/50">{type === "linear" ? t("editor.fills.linear", { defaultValue: "Linear" }) : t("editor.fills.radial", { defaultValue: "Radial" })}</Text></View>
    <View className="flex-row" style={{ gap: 8 }}>
      <TextInput accessibilityLabel={t("editor.fills.first", { defaultValue: "First colour" })} value={first} onChangeText={setFirst} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <TextInput accessibilityLabel={t("editor.fills.last", { defaultValue: "Last colour" })} value={last} onChangeText={setLast} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <TextInput accessibilityLabel={t("editor.fills.angle", { defaultValue: "Angle" })} value={angle} onChangeText={setAngle} keyboardType="number-pad" className="min-h-[40px] w-16 rounded-lg border border-white/20 px-2 text-xs text-white" />
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {button(t("editor.fills.apply", { defaultValue: "Apply fill" }), () => apply(gradientFromColours([first, last], type, Number(angle))), !valid || !canFill)}
      {button(t("editor.fills.background", { defaultValue: "Use as page background" }), () => apply(gradientFromColours([first, last], type, Number(angle)), true), !valid)}
      {button(t("editor.fills.solid", { defaultValue: "Restore solid fill" }), () => apply(null), !canFill)}
    </View>
  </ScrollView>;
}
