import GradientBrandPalettes from "./GradientBrandPalettes";
import GradientStyleFileControls from "./GradientStyleFileControls";
import GradientVectorDownload from "./GradientVectorDownload";
import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { GRADIENT_PRESETS, gradientFromColours, validGradientFill, type GradientFill } from "../../libs/editor/gradientFill";
import { useGradientDraft } from "../../libs/editor/useGradientDraft";
import { fillDesignLayers, putGradientBackground, putSolidBackground, solidDesignLayers, removePageBackground } from "../../libs/editor/fillProject";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";
import PhotoBackgroundControls from "./PhotoBackgroundControls";
import GradientEditor from "./GradientEditor";
import BackgroundScopeControls from "./BackgroundScopeControls";

export default function FillPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(clip => clip.id === selectedId);
  const { fill, setFill, first } = useGradientDraft(selected);
  const [error, setError] = useState("");
  const canFill = !!selected && !selected.locked && (selected.kind === "text" || (selected.kind === "shape" && !selected.chart && !selected.table && !selected.qr));
  const valid = validGradientFill(fill), solidValid = /^#[\da-f]{6}$/i.test(first);
  const apply = (value: GradientFill | null, background = false) => {
    const latest = current(); if (!latest || latest.id !== project.id || (value && !validGradientFill(value))) return;
    const result = background && value ? putGradientBackground(latest, time, value, () => newId(10)) : null;
    if (background && !result) { setError(t("editor.fills.lockedBackground", { defaultValue: "Unlock the page background before replacing it." })); return; }
    const next = background ? result?.project : fillDesignLayers(latest, selectedId ? [selectedId] : [], value);
    if (next && next !== latest) { commit(next); if (result) select(result.id); }
    setError("");
  };
  const applySolid = (background = false) => {
    const latest = current(); if (!latest || latest.id !== project.id || !solidValid) return;
    const result = background ? putSolidBackground(latest, time, first, () => newId(10)) : null;
    if (background && !result) { setError(t("editor.fills.lockedBackground", { defaultValue: "Unlock the page background before replacing it." })); return; }
    const next = background ? result?.project : solidDesignLayers(latest, selectedId ? [selectedId] : [], first);
    if (next && next !== latest) { commit(next); if (result) select(result.id); }
    setError("");
  };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/80">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <PhotoBackgroundControls project={project} selectedId={selectedId} time={time} current={current} commit={commit} select={select} />
    <BackgroundScopeControls project={project} time={time} current={current} commit={commit} select={select} />
    <Text className="text-xs text-white/55">{t("editor.fills.hint", { defaultValue: "Apply a gradient to selected text or shapes, or add it behind this page." })}</Text>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{GRADIENT_PRESETS.map(preset => <Pressable key={preset.id} accessibilityRole="button" onPress={() => { const next = { ...fill, stops: gradientFromColours(preset.colours).stops }; setFill(next); apply(next, !canFill); }} className="rounded-lg border border-white/15 p-2" style={{ gap: 6 }}><View className="flex-row overflow-hidden rounded">{preset.colours.map(colour => <View key={colour} style={{ width: 25, height: 24, backgroundColor: colour }} />)}</View><Text className="text-xs text-white">{t(`editor.fills.preset.${preset.id}`, { defaultValue: preset.label })}</Text></Pressable>)}</ScrollView>
    <GradientBrandPalettes value={fill} onChange={setFill} />
    <GradientEditor value={fill} onChange={setFill} projectId={project.id} />
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {button(t("editor.fills.apply", { defaultValue: "Apply fill" }), () => apply(fill), !valid || !canFill)}
      {button(t("editor.fills.background", { defaultValue: "Use as page background" }), () => apply(fill, true), !valid)}
      {button(t("editor.fills.applySolid", { defaultValue: "Apply first colour as solid" }), () => applySolid(), !canFill || !solidValid)}
      {button(t("editor.fills.solidBackground", { defaultValue: "Use first colour as page background" }), () => applySolid(true), !solidValid)}
      {button(t("editor.fills.resetBackground", { defaultValue: "Reset page background" }), () => { const latest = current(); if (latest?.id !== project.id) return; const next = removePageBackground(latest, time); if (next !== latest) commit(next); })}
      {button(t("editor.fills.solid", { defaultValue: "Restore solid fill" }), () => apply(null), !canFill)}
    </View><GradientStyleFileControls key={project.id} value={fill} title={project.title} onApply={setFill} /><GradientVectorDownload value={fill} width={project.settings.width} height={project.settings.height} title={project.title} />{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
