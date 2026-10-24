import React from "react";
import { Pressable, Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
export default function TableCellSizeControls({ value, onApply }: { value?: number; onApply: (value?: number) => void }) {
  const { t } = useTranslation(), [percent, setPercent] = useState(Math.round((value ?? 1) * 100));
  useEffect(() => { setPercent(Math.round((value ?? 1) * 100)); }, [value]);
  return <View style={{ gap: 6 }}><Text className="text-xs text-white/65">{t("editor.tables.cellTextSize", { defaultValue: "Selected cell text size" })}: {percent}%</Text><Slider minimumValue={50} maximumValue={300} step={5} value={percent} onValueChange={setPercent} accessibilityLabel={t("editor.tables.cellTextSize", { defaultValue: "Selected cell text size" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" /><View className="flex-row flex-wrap" style={{ gap: 6 }}><Pressable accessibilityRole="button" onPress={() => onApply(percent / 100)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.tables.applyCellTextSize", { defaultValue: "Apply text size" })}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => onApply(undefined)} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.tables.defaultCellTextSize", { defaultValue: "Use table text size" })}</Text></Pressable></View></View>;
}
