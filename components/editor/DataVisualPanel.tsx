import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "../../libs/editor/dataVisualProject";
import { parseChartData, parseTableData, type ChartKind, type ChartData, type TableData } from "../../libs/editor/dataVisuals";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DataVisualPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const selected = project.clips.find(c => c.id === selectedId);
  const chart = selected?.kind === "shape" ? selected.chart : undefined;
  const table = selected?.kind === "shape" ? selected.table : undefined;
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const [kind, setKind] = useState<ChartKind>("column");
  const [data, setData] = useState("");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  const choose = (value: "chart" | "table") => {
    setMode(value); setError("");
    if (value === "chart") {
      const next = chart ?? DEFAULT_CHART;
      setKind(next.kind); setData(next.rows.map(row => `${row.label},${row.value}`).join("\n")); setForeground(next.textColour);
      setAccent(next.colours[0] ?? "#38bdf8"); setShowLabels(next.showLabels); setShowValues(next.showValues);
    } else {
      const next = table ?? DEFAULT_TABLE;
      setData(next.rows.map(row => row.join("\t")).join("\n")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    }
  };
  useEffect(() => { choose(table ? "table" : "chart"); }, [selected?.id, chart, table]);
  const apply = () => {
    if (!/^#[0-9a-f]{6}$/i.test(foreground) || !/^#[0-9a-f]{6}$/i.test(accent)) { setError(t("editor.dataVisual.invalidColour", { defaultValue: "Use a six-digit hex colour" })); return; }
    try {
      const latest = current();
      if (!latest || latest.id !== project.id) return;
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, rows: parseChartData(data),
        colours: [accent, ...(chart ?? DEFAULT_CHART).colours.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...(table ?? DEFAULT_TABLE), rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(latest, time, value, () => newId(10), selectedId);
      if (result) { commit(result.project); select(result.id); }
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white" : "border-white/20"}`}><Text className={`text-xs ${active ? "text-black" : "text-white"}`}>{label}</Text></Pressable>;
  return <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 270 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}>{chip(t("editor.dataVisual.chart", { defaultValue: "Chart" }), mode === "chart", () => choose("chart"))}{chip(t("editor.dataVisual.table", { defaultValue: "Table" }), mode === "table", () => choose("table"))}</View>
    {mode === "chart" && <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{(["column", "bar", "line", "pie", "donut"] as const).map(value => chip(t(`editor.dataVisual.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) }), kind === value, () => setKind(value)))}</ScrollView>}
    <Text className="text-xs text-white/60">{t(mode === "chart" ? "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</Text>
    <TextInput multiline accessibilityLabel={t("editor.dataVisual.data", { defaultValue: "Data" })} value={data} onChangeText={setData} autoCorrect={false} textAlignVertical="top" className="min-h-[90px] rounded-lg border border-white/20 px-3 py-2 text-sm text-white" />
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text className="text-xs text-white/60">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}</Text><TextInput accessibilityLabel={t("editor.dataVisual.textColour", { defaultValue: "Text" })} value={foreground} onChangeText={setForeground} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <Text className="text-xs text-white/60">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}</Text><TextInput accessibilityLabel={t("editor.dataVisual.accent", { defaultValue: "Accent" })} value={accent} onChangeText={setAccent} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
    </View>
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      <Switch accessibilityLabel={t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })} value={showLabels} onValueChange={setShowLabels} /><Text className="text-xs text-white/70">{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</Text>
      {mode === "chart" && <><Switch accessibilityLabel={t("editor.dataVisual.values", { defaultValue: "Show values" })} value={showValues} onValueChange={setShowValues} /><Text className="text-xs text-white/70">{t("editor.dataVisual.values", { defaultValue: "Show values" })}</Text></>}
    </View>
    <Pressable accessibilityRole="button" disabled={!!selected?.locked && !!(chart || table)} onPress={apply} className="min-h-[40px] items-center justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</Text></Pressable>
    {error !== "" && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
  </ScrollView>;
}
