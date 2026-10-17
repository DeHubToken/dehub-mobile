import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { transposeChartSource } from "../../libs/editor/chartTranspose";
export default function ChartTransposeControl({ source, multiple, disabled = false, onChange }: { source: string; multiple: boolean; disabled?: boolean; onChange: (source: string) => void }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const apply = () => { try { const next = transposeChartSource(source, multiple); onChange(next); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not switch chart data"); } };
  return <View style={{ gap: 4 }}><Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={apply} style={{ opacity: disabled ? 0.35 : 1 }} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.charts.transpose", { defaultValue: "Switch rows and columns" })}</Text></Pressable><Text className="text-[10px] text-white/45">{disabled ? t("editor.charts.transposeScatter", { defaultValue: "Switch to a category chart to transpose data." }) : t("editor.charts.transposeHint", { defaultValue: "Up to six categories become series. Existing series become categories; palette order stays unchanged." })}</Text>{error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
