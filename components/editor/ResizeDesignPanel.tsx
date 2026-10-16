import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { useDocumentSize } from "../../libs/editor/useDocumentSize";
import { DESIGN_UNITS, DOCUMENT_SIZE_PRESETS, dimensionDisplay, resizeDocument } from "../../libs/editor/documentDimensions";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function ResizeDesignPanel({ project, current, commit }: {
  project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void;
}) {
  const { t } = useTranslation();
  const { unit, dpi, width, height, locked, pixels, valid, setDpi, change, changeUnit, toggleLock, swap } = useDocumentSize(project.settings);
  const [error, setError] = useState("");
  const apply = (w: number, h: number, resolution: number) => { try { const latest = current(); if (!latest || latest.id !== project.id) return; const next = resizeDocument(latest, w, h, resolution); if (next !== latest) commit(next); setError(""); } catch (value) { setError(value instanceof Error ? value.message : "Could not resize this design"); } };
  const button = (label: string, onPress: () => void, active = false, disabled = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white/10" : "border-white/20"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white/80">{label}</Text></Pressable>;
  return <View className="px-3" style={{ gap: 10 }}>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{DOCUMENT_SIZE_PRESETS.map(size => <Pressable key={size.id} accessibilityRole="button" onPress={() => apply(size.width, size.height, size.dpi)} className="rounded-lg border border-white/15 p-3" style={{ gap: 4 }}><Text className="text-xs font-semibold text-white">{t(`editor.designTools.size.${size.id}`, { defaultValue: size.label })}</Text><Text className="text-xs text-white/45">{size.width} × {size.height} px</Text></Pressable>)}</ScrollView>
    <View className="flex-row" style={{ gap: 8 }}><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/65">{t("editor.resize.width", { defaultValue: "Width" })}</Text><TextInput value={width} onChangeText={value => change("width", value)} keyboardType="decimal-pad" maxLength={24} accessibilityLabel={t("editor.resize.width", { defaultValue: "Width" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View><View className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/65">{t("editor.resize.height", { defaultValue: "Height" })}</Text><TextInput value={height} onChangeText={value => change("height", value)} keyboardType="decimal-pad" maxLength={24} accessibilityLabel={t("editor.resize.height", { defaultValue: "Height" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" /></View></View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{DESIGN_UNITS.map(value => button(value, () => changeUnit(value), unit === value))}</View>
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>{button(t("editor.resize.lockAspect", { defaultValue: "Lock aspect ratio" }), toggleLock, locked)}{button(t("editor.resize.swap", { defaultValue: "Swap dimensions" }), swap)}</View>
    <Text className="text-xs text-white/65">{t("editor.resize.dpi", { defaultValue: "Print resolution (pixels/inch)" })}</Text><TextInput value={dpi} onChangeText={setDpi} keyboardType="number-pad" maxLength={3} accessibilityLabel={t("editor.resize.dpi", { defaultValue: "Print resolution (pixels/inch)" })} className="min-h-[40px] rounded-lg border border-white/20 px-3 text-white" />
    <Text className="text-xs text-white/45">{valid ? `${pixels.width} × ${pixels.height} px · ${dimensionDisplay(pixels.width, "mm", Number(dpi))} × ${dimensionDisplay(pixels.height, "mm", Number(dpi))} mm` : t("editor.resize.range", { defaultValue: "Each side must resolve to 64–8,192 pixels. Print resolution must be 72–600." })}</Text>
    <Text className="text-xs text-white/45">{t("editor.resize.printHint", { defaultValue: "Print resolution sets the physical page size in PDF downloads. Existing measurements scale with the canvas." })}</Text>
    {button(t("editor.designTools.applySize", { defaultValue: "Apply size" }), () => apply(pixels.width, pixels.height, Number(dpi)), false, !valid)}
    {error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </View>;
}
