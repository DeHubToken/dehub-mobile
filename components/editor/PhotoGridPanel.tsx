import MockupFrameControls from "./MockupFrameControls";
import React, { useState } from "react";
import PhotoArrangementPanel from "./PhotoArrangementPanel";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { insertPhotoGrid, PHOTO_GRIDS, type PhotoGridId } from "../../libs/editor/photoGrids";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";
import Svg, { Path } from "react-native-svg";
import Slider from "@react-native-community/slider";
import { MEDIA_FRAMES, MEDIA_FRAME_NAMES, mediaFramePreview, type MediaFrame } from "../../libs/editor/mediaFrames";

export default function PhotoGridPanel({ project, current, commit, select, time, selectedId = null }: { project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number; selectedId?: string | null }) {
  const { t } = useTranslation();
  const [grid, setGrid] = useState<PhotoGridId>("four"), [gap, setGap] = useState("16");
  const [frame, setFrame] = useState<MediaFrame>("rect"), [radius, setRadius] = useState(0);
  return <View className="px-3" style={{ gap: 10 }}>
    <PhotoArrangementPanel project={project} current={current} commit={commit} time={time} selectedId={selectedId} />
    <MockupFrameControls project={project} current={current} commit={commit} select={select} time={time} selectedId={selectedId} />
    <Text className="text-xs text-white/60">{t("editor.grids.mobileHint", { defaultValue: "Insert a photo layout. Tap a frame and choose Replace selected layer to fill it with a photo or video." })}</Text>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{PHOTO_GRIDS.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityState={{ selected: grid === preset.id }} onPress={() => setGrid(preset.id)} className={`rounded-lg border p-3 ${grid === preset.id ? "border-white bg-white/10" : "border-white/15"}`} style={{ gap: 8 }}>
      <View style={{ width: 72, height: 48 }}>{[...preset.cells].map(([column, row, columns, rows], index) => <Svg key={index} viewBox="0 0 100 100" preserveAspectRatio="none" width={columns * 72 / preset.columns - 2} height={rows * 48 / preset.rows - 2} style={{ position: "absolute", left: column * 72 / preset.columns + 1, top: row * 48 / preset.rows + 1 }}><Path d={mediaFramePreview(frame)} fill="#94a3b8" /></Svg>)}</View>
      <Text className="text-xs text-white">{t(`editor.grids.layout.${preset.id}`, { defaultValue: preset.label })}</Text>
    </Pressable>)}</ScrollView>
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{MEDIA_FRAMES.map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: frame === value }} onPress={() => setFrame(value)} className={`min-h-[40px] flex-row items-center rounded-lg border px-2 ${frame === value ? "border-white bg-white/10" : "border-white/15"}`} style={{ gap: 6 }}><Svg width={22} height={22} viewBox="0 0 100 100"><Path d={mediaFramePreview(value)} fill="#cccccc" /></Svg><Text className="text-xs text-white">{t(`editor.frames.${value}`, { defaultValue: MEDIA_FRAME_NAMES[value] })}</Text></Pressable>)}</ScrollView>
    {frame === "rect" && <><Text className="text-xs text-white/60">{t("editor.grids.rounding", { defaultValue: "Corner rounding" })}: {radius}</Text><Slider minimumValue={0} maximumValue={200} step={1} value={radius} onValueChange={setRadius} accessibilityLabel={t("editor.grids.rounding", { defaultValue: "Corner rounding" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" /></>}
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text className="flex-1 text-xs text-white/60">{t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })}</Text><TextInput value={gap} onChangeText={setGap} keyboardType="number-pad" accessibilityLabel={t("editor.grids.spacing", { defaultValue: "Spacing in pixels" })} className="min-h-[40px] w-16 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <Pressable accessibilityRole="button" disabled={!Number.isFinite(Number(gap)) || Number(gap) < 0 || Number(gap) > 100} onPress={() => { const before = current(); if (!before || before.id !== project.id) return; const result = insertPhotoGrid(before, time, grid, Number(gap), () => newId(10), { frame, radius: frame === "rect" ? radius : 0 }); if (result) { commit(result.project); select(result.ids[0]); } }} className="min-h-[40px] justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t("editor.grids.insert", { defaultValue: "Insert photo grid" })}</Text></Pressable>
    </View>
  </View>;
}
