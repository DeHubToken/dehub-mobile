import { designPrintDpi, dimensionDisplay, pixelsPerUnit } from "../../libs/editor/documentDimensions";
import React, { useEffect, useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { useTranslation } from "react-i18next";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import { applyDesignGuideGrid, designGuideGridPositions, getDesignGuides, type GuideGridOptions } from "../../libs/editor/designGuides";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function GuideGridControls({ project, current, commit }: { project: ProjectSnapshot; current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void }) {
  const { t } = useTranslation(), settings = project.settings;
  const unit = getDesignGuides(settings.guides).unit, dpi = designPrintDpi(settings);
  const [options, setOptions] = useState<GuideGridOptions>({ columns: 3, rows: 3, margin: Math.round(Math.min(settings.width, settings.height) * 0.05), gutter: Math.round(Math.min(settings.width, settings.height) * 0.02), replace: true }), [message, setMessage] = useState("");
  const [unitDrafts, setUnitDrafts] = useState(() => ({ margin: dimensionDisplay(options.margin, unit, dpi), gutter: dimensionDisplay(options.gutter, unit, dpi) }));
  useEffect(() => { setUnitDrafts({ margin: dimensionDisplay(options.margin, unit, dpi), gutter: dimensionDisplay(options.gutter, unit, dpi) }); }, [unit, dpi]);
  let grid: { vertical: number[]; horizontal: number[] } | null = null, error = "";
  try { grid = designGuideGridPositions(settings.width, settings.height, options); } catch (value) { error = value instanceof Error ? value.message : String(value); }
  const apply = () => { try { const before = current(); if (!before || before.id !== project.id) return; commit(applyDesignGuideGrid(before, options)); setMessage(t("editor.guides.gridApplied", { defaultValue: "Guide grid applied" })); } catch (value) { setMessage(value instanceof Error ? value.message : String(value)); } };
  return <View className="border-t border-white/10 pt-3" style={{ gap: 10 }}>
    <Text className="text-xs font-semibold text-white/75">{t("editor.guides.gridTitle", { defaultValue: "Layout grid" })}</Text>
    <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}><Svg width={112} height={80} viewBox={`0 0 ${settings.width} ${settings.height}`} accessibilityLabel={t("editor.guides.gridPreview", { defaultValue: "Guide grid preview" })}><Rect x={0} y={0} width={settings.width} height={settings.height} fill="#202020" stroke="#888" strokeWidth={0.5} />{grid?.vertical.map(x => <Line key={`x${x}`} x1={x * settings.width} x2={x * settings.width} y1={0} y2={settings.height} stroke="#22d3ee" strokeWidth={Math.max(settings.width, settings.height) / 200} />)}{grid?.horizontal.map(y => <Line key={`y${y}`} x1={0} x2={settings.width} y1={y * settings.height} y2={y * settings.height} stroke="#22d3ee" strokeWidth={Math.max(settings.width, settings.height) / 200} />)}</Svg>
      {(["columns", "rows", "margin", "gutter"] as const).map(key => <View key={key} style={{ gap: 4 }}><Text className="text-xs text-white/60">{t(`editor.guides.grid.${key}`, { defaultValue: ({ columns: "Columns", rows: "Rows", margin: `Margin (${unit})`, gutter: `Gutter (${unit})` })[key] })}</Text><TextInput keyboardType={key === "columns" || key === "rows" ? "number-pad" : "decimal-pad"} value={key === "columns" || key === "rows" ? String(options[key]) : unitDrafts[key]} onChangeText={value => { if (key === "margin" || key === "gutter") setUnitDrafts(previous => ({ ...previous, [key]: value })); setOptions({ ...options, [key]: key === "columns" || key === "rows" ? Number(value) : Number(value.replace(",", ".")) * pixelsPerUnit(unit, dpi) }); setMessage(""); }} accessibilityLabel={t(`editor.guides.grid.${key}`, { defaultValue: key })} className="min-h-[40px] w-24 rounded-lg border border-white/20 px-3 text-xs text-white" /></View>)}
    </View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 10 }}><Switch value={options.replace} onValueChange={replace => setOptions({ ...options, replace })} accessibilityLabel={t("editor.guides.replaceExisting", { defaultValue: "Replace existing guides" })} /><Text className="text-xs text-white/65">{t("editor.guides.replaceExisting", { defaultValue: "Replace existing guides" })}</Text><Pressable accessibilityRole="button" disabled={!!error} onPress={apply} className="min-h-[40px] justify-center rounded-lg bg-white px-3" style={{ opacity: error ? 0.35 : 1 }}><Text className="text-xs font-semibold text-black">{t("editor.guides.applyGrid", { defaultValue: "Apply grid" })}</Text></Pressable></View>
    {!!(error || message) && <Text accessibilityLiveRegion="polite" className="text-xs text-white/55">{error || message}</Text>}
  </View>;
}
