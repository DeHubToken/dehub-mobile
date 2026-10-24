import React from "react";
import { Pressable, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { JPEG_QUALITY_PRESETS } from "../../libs/editor/imageExportOptions";
export default function JpegQualityControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const { t } = useTranslation();
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Text className="text-xs text-white/75">{t("editor.export.jpegQuality", { defaultValue: "JPEG quality" })}: {Math.round(value * 100)}%</Text><Slider minimumValue={50} maximumValue={100} step={1} value={Math.round(value * 100)} onValueChange={percent => onChange(percent / 100)} accessibilityLabel={t("editor.export.jpegQuality", { defaultValue: "JPEG quality" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" /><View className="flex-row flex-wrap" style={{ gap: 8 }}>{JPEG_QUALITY_PRESETS.map(preset => <Pressable accessibilityRole="button" accessibilityState={{ selected: value === preset.quality }} key={preset.id} onPress={() => onChange(preset.quality)} className={`min-h-[40px] justify-center rounded-lg border px-3 ${value === preset.quality ? "border-cyan-300 bg-cyan-300/10" : "border-white/20"}`}><Text className="text-xs text-white/75">{t(`editor.export.jpegPreset.${preset.id}`, { defaultValue: preset.label })}</Text></Pressable>)}</View><Text className="text-[10px] text-white/45">{t("editor.export.jpegQualityHint", { defaultValue: "Lower quality usually produces smaller files. Pixel dimensions stay the same; detailed artwork may show compression." })}</Text></View>;
}
