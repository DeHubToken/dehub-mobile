import { designPrintDpi } from "../../libs/editor/documentDimensions";
import GuideGridControls from "./GuideGridControls";
import React, { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { changeDesignGuides, getDesignGuides, type DesignGuides } from "../../libs/editor/designGuides";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function GuidesPanel({ project, current, commit }: { project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void }) {
  const { t } = useTranslation();
  const guides = getDesignGuides(project.settings.guides);
  const [position, setPosition] = useState("50"), [axis, setAxis] = useState<"vertical" | "horizontal">("vertical");
  const apply = (patch: Partial<DesignGuides>) => { const latest = current(); if (latest?.id === project.id) commit(changeDesignGuides(latest, patch)); };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable key={label} accessibilityRole="button" disabled={disabled} onPress={onPress} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12 }}>
    <Text className="text-xs text-white/60">{t("editor.guides.hint", { defaultValue: "Drag from a ruler to add a guide. Choose Edit guides to move guides, or drag them off the page to remove them. Guides and margins are not included in downloads." })}</Text>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      <Switch accessibilityLabel={t("editor.guides.visible", { defaultValue: "Show guides" })} value={guides.visible} onValueChange={visible => apply({ visible })} /><Text className="text-xs text-white/70">{t("editor.guides.visible", { defaultValue: "Show guides" })}</Text>
      <Switch accessibilityLabel={t("editor.guides.smartSpacing", { defaultValue: "Snap equal spacing" })} value={guides.spacing} onValueChange={spacing => apply({ spacing })} /><Text className="text-xs text-white/70">{t("editor.guides.smartSpacing", { defaultValue: "Snap equal spacing" })}</Text>
      <Switch accessibilityLabel={t("editor.guides.rulers", { defaultValue: "Show rulers" })} value={guides.rulers} onValueChange={rulers => apply({ rulers })} /><Text className="text-xs text-white/70">{t("editor.guides.rulers", { defaultValue: "Show rulers" })}</Text>
      <Switch accessibilityLabel={t("editor.guides.snap", { defaultValue: "Snap to guides" })} value={guides.snap} onValueChange={snap => apply({ snap })} /><Text className="text-xs text-white/70">{t("editor.guides.snap", { defaultValue: "Snap to guides" })}</Text>
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {button(t("editor.guides.centre", { defaultValue: "Centre" }), () => apply({ vertical: [0.5], horizontal: [0.5], visible: true }))}
      {button(t("editor.guides.thirds", { defaultValue: "Thirds" }), () => apply({ vertical: [1 / 3, 2 / 3], horizontal: [1 / 3, 2 / 3], visible: true }))}
      {button(t("editor.guides.clear", { defaultValue: "Clear" }), () => apply({ vertical: [], horizontal: [], margin: 0 }))}
    </View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      {button(t(`editor.guides.${axis}`, { defaultValue: axis === "vertical" ? "Vertical" : "Horizontal" }), () => setAxis(axis === "vertical" ? "horizontal" : "vertical"))}
      <TextInput keyboardType="decimal-pad" value={position} onChangeText={setPosition} accessibilityLabel={t("editor.guides.position", { defaultValue: "Position as a percentage" })} className="min-h-[40px] w-16 rounded-lg border border-white/20 px-2 text-xs text-white" /><Text className="text-white/60">%</Text>
      {button(t("editor.guides.add", { defaultValue: "Add guide" }), () => apply({ [axis]: [...guides[axis], Number(position) / 100], visible: true }), !Number.isFinite(Number(position)) || Number(position) < 0 || Number(position) > 100)}
      <Text className="text-xs text-white/60">{t("editor.guides.margin", { defaultValue: "Margin" })}</Text><TextInput keyboardType="number-pad" value={String(Math.round(guides.margin * 100))} onChangeText={value => apply({ margin: Number(value) / 100, visible: true })} accessibilityLabel={t("editor.guides.margin", { defaultValue: "Margin" })} className="min-h-[40px] w-16 rounded-lg border border-white/20 px-2 text-xs text-white" />
    </View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["vertical", "horizontal"] as const).flatMap(direction => guides[direction].map(n => button(`${direction === "vertical" ? "X" : "Y"} ${Number((n * 100).toFixed(1))}% ×`, () => apply({ [direction]: guides[direction].filter(value => value !== n) }))))}</View>
    <Text className="text-xs text-white/65">{t("editor.guides.rulerUnits", { defaultValue: "Ruler units" })}</Text><View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["px", "in", "cm", "mm"] as const).map(unit => <Pressable key={unit} accessibilityRole="button" accessibilityState={{ selected: guides.unit === unit }} onPress={() => apply({ unit, rulers: true })} className={`min-h-[40px] justify-center rounded-lg border px-3 ${guides.unit === unit ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white">{unit}</Text></Pressable>)}</View><Text className="text-xs text-white/40">{t("editor.guides.resolution", { defaultValue: "Based on {{dpi}} pixels per inch", dpi: designPrintDpi(project.settings) })}</Text>
    <GuideGridControls project={project} current={current} commit={commit} />
  </ScrollView>;
}
