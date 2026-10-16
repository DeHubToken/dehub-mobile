import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { parseChartSource } from "../../libs/editor/chartSeries";
import { setProgressChartSource } from "../../libs/editor/progressChartSource";
export default function ProgressDataControls({ source, multiple, onChange }: { source: string; multiple: boolean; onChange: (source: string) => void }) {
  const { t } = useTranslation(), [error, setError] = useState("");
  const value = useMemo(() => { try { return parseChartSource(source, multiple).rows[0]?.value ?? null; } catch { return null; } }, [source, multiple]);
  return <View className="rounded-lg border border-white/10 p-3" style={{ gap: 8 }}><Text className="text-xs text-white/65">{t("editor.charts.progressPercentage", { defaultValue: "Progress percentage" })}: {value ?? "—"}%</Text><Slider minimumValue={0} maximumValue={100} step={0.1} disabled={value === null} value={Math.max(0, Math.min(100, value ?? 0))} onValueChange={percentage => { try { onChange(setProgressChartSource(source, multiple, percentage)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update progress"); } }} accessibilityLabel={t("editor.charts.progressPercentage", { defaultValue: "Progress percentage" })} minimumTrackTintColor="#ffffff" maximumTrackTintColor="#444444" thumbTintColor="#ffffff" /><Text className="text-[10px] text-white/45">{t("editor.charts.progressDataHint", { defaultValue: "The first value is a percentage from 0 to 100, and its row label names the goal. The slider edits that source value. Other rows and series are retained in the data grid and CSV." })}</Text>{!!error && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}</View>;
}
