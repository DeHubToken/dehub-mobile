import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { insertPhotoGrid, PHOTO_GRIDS, type PhotoGridId } from "../../libs/editor/photoGrids";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function PhotoGridPanel({ project, current, commit, select, time }: { project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number }) {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<PhotoGridId>("four"), [gap, setGap] = useState("16");
  return <View className="px-3" style={{ gap: 10 }}>
    <Text className="text-xs text-white/60">{t("editor.grids.mobileHint", { defaultValue: "Insert a photo layout. Tap a frame and choose Replace selected layer to fill it with a photo or video." })}</Text>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{PHOTO_GRIDS.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityState={{ selected: grid === preset.id }} onPress={() => setGrid(preset.id)} className={`rounded-lg border p-3 ${grid === preset.id ? "border-white bg-white/10" : "border-white/15"}`} style={{ gap: 8 }}>
      <View style={{ width: 72, height: 48 }}>{preset.cells.map(([column, row, columns, rows], index) => <View key={index} style={{ position: "absolute", left: column * 72 / preset.columns + 1, top: row * 48 / preset.rows + 1, width: columns * 72 / preset.columns - 2, height: rows * 48 / preset.rows - 2, borderRadius: 2, backgroundColor: "#94a3b8" }} />)}</View>
      <Text className="text-xs text-white">{t(`editor.grids.layout.${preset.id}`, { defaultValue: preset.label })}</Text>
    </Pressable>)}</ScrollView>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text className="flex-1 text-xs text-white/60">{t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })}</Text><TextInput value={gap} onChangeText={setGap} keyboardType="number-pad" accessibilityLabel={t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })} className="min-h-[40px] w-16 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <Pressable accessibilityRole="button" disabled={!Number.isFinite(Number(gap)) || Number(gap) < 0 || Number(gap) > 100} onPress={() => { const before = current(); if (!before || before.id !== project.id) return; const result = insertPhotoGrid(before, time, grid, Number(gap), () => newId(10)); if (result) { commit(result.project); select(result.ids[0]); } }} className="min-h-[40px] justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t("editor.grids.insert", { defaultValue: "Insert photo grid" })}</Text></Pressable>
    </View>
  </View>;
}
