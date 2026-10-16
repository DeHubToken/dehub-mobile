import ColourPickerButton from "./ColourPickerButton";
import ChartFormattingPanel, { type ChartAppearance } from "./ChartFormattingPanel";
import { chartDataSource, parseChartSource } from "../../libs/editor/chartSeries";
import TableFormattingPanel from "./TableFormattingPanel";
import { DESIGN_PALETTES } from "../../libs/editor/designTools";
import DataCells from "./DataCells";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { formatDelimitedData } from "../../libs/editor/delimitedData";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "../../libs/editor/dataVisualProject";
import { CHART_KINDS, validDataVisuals, parseTableData, type ChartKind, type ChartData, type TableData } from "../../libs/editor/dataVisuals";
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
  const [dataView, setDataView] = useState<"cells" | "source">("cells");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [chartPalette, setChartPalette] = useState<string[]>([...DEFAULT_CHART.colours]);
  const [chartAppearance, setChartAppearance] = useState<ChartAppearance>({});
  const [tableFormat, setTableFormat] = useState<Omit<TableData, "rows">>({ ...DEFAULT_TABLE });
  const [multiple, setMultiple] = useState(false), [stacked, setStacked] = useState(false), [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  const importRequest = useRef(0);
  useEffect(() => { importRequest.current++; return () => { importRequest.current++; }; }, [project.id, selectedId, mode]);
  const importFile = async () => {
    const request = ++importRequest.current;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/tab-separated-values", "text/plain", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || request !== importRequest.current || current()?.id !== project.id) return;
      const file = result.assets[0];
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Choose a CSV or TSV file");
      const info = await FileSystem.getInfoAsync(file.uri);
      if (!info.exists || info.isDirectory || info.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await FileSystem.readAsStringAsync(file.uri);
      if (request !== importRequest.current || current()?.id !== project.id) return;
      setData(text.replace(/^\uFEFF/, "")); setError("");
    } catch (error) { if (request === importRequest.current) setError(error instanceof Error ? error.message : "Could not read this file"); }
  };
  const choose = (value: "chart" | "table") => {
    setMode(value); setError("");
    if (value === "chart") {
      const next = chart ?? DEFAULT_CHART;
      setChartAppearance({ valueFormat: next.valueFormat, donutHole: next.donutHole });
      setChartPalette([...next.colours]); setKind(next.kind); setData(chartDataSource(next)); setMultiple(!!next.series?.length); setStacked(!!next.stacked); setShowLegend(next.showLegend !== false); setForeground(next.textColour);
      setAccent(next.colours[0] ?? "#38bdf8"); setShowLabels(next.showLabels); setShowValues(next.showValues);
    } else {
      const next = table ?? DEFAULT_TABLE;
      setTableFormat({ ...next }); setData(formatDelimitedData(next.rows, "\t")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    }
  };
  useEffect(() => { choose(table ? "table" : "chart"); }, [selected?.id, chart, table]);
  const changeMultiple = (value: boolean) => {
    importRequest.current++;
    try { const parsed = parseChartSource(data, multiple); setData(chartDataSource({ ...DEFAULT_CHART, ...parsed }, value)); } catch { /* Keep pasted source available for correction in its new format. */ }
    setMultiple(value); setError("");
  };
  const seriesNames = useMemo(() => {
    if (!multiple) return [];
    try { return parseChartSource(data, true).series?.map(series => series.label) ?? []; } catch { return []; }
  }, [data, multiple]);
  const seriesColour = (index: number) => index === 0 ? accent : chartPalette[index % chartPalette.length] ?? DEFAULT_CHART.colours[index % DEFAULT_CHART.colours.length];
  const setSeriesColour = (index: number, colour: string) => {
    if (index === 0) { setAccent(colour); return; }
    setChartPalette(previous => { const next = Array.from({ length: 6 }, (_, i) => previous[i % previous.length] ?? DEFAULT_CHART.colours[i % DEFAULT_CHART.colours.length]); next[index] = colour; return next; });
  };
  const apply = () => {
    if (!/^#[0-9a-f]{6}$/i.test(foreground) || !/^#[0-9a-f]{6}$/i.test(accent)) { setError(t("editor.dataVisual.invalidColour", { defaultValue: "Use a six-digit hex colour" })); return; }
    try {
      const latest = current();
      if (!latest || latest.id !== project.id) return;
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, showLegend,
        colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if (!validDataVisuals(value)) throw new Error("Use valid colours and table formatting");
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(latest, time, value, () => newId(10), selectedId);
      if (result) { commit(result.project); select(result.id); }
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white" : "border-white/20"}`}><Text className={`text-xs ${active ? "text-black" : "text-white"}`}>{label}</Text></Pressable>;
  return <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 270 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12 }}>
    {mode === "chart" && <View style={{ gap: 8 }}><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={multiple} onValueChange={changeMultiple} accessibilityLabel={t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })}</Text></View>{multiple && <><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={showLegend} onValueChange={setShowLegend} accessibilityLabel={t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })}</Text></View>{(kind === "bar" || kind === "column") && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={stacked} onValueChange={setStacked} accessibilityLabel={t("editor.dataVisual.stacked", { defaultValue: "Stack series" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.stacked", { defaultValue: "Stack series" })}</Text></View>}{(kind === "pie" || kind === "donut") && <Text className="text-xs text-white/45">{t("editor.dataVisual.pieSeriesHint", { defaultValue: "Pie and donut charts display the first data series." })}</Text>}</>}</View>}
    <View className="flex-row" style={{ gap: 8 }}>{chip(t("editor.dataVisual.chart", { defaultValue: "Chart" }), mode === "chart", () => choose("chart"))}{chip(t("editor.dataVisual.table", { defaultValue: "Table" }), mode === "table", () => choose("table"))}</View>
    {mode === "chart" && <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{CHART_KINDS.map(value => chip(t(`editor.dataVisual.${value}`, { defaultValue: value.charAt(0).toUpperCase() + value.slice(1) }), kind === value, () => setKind(value)))}</ScrollView>}
    {mode === "chart" && <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{DESIGN_PALETTES.map(palette => <Pressable key={palette.id} accessibilityRole="button" onPress={() => { setChartPalette([...palette.colours]); setAccent(palette.colours[0]); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ gap: 4 }}><View className="flex-row overflow-hidden rounded">{palette.colours.map(colour => <View key={colour} style={{ width: 14, height: 12, backgroundColor: colour }} />)}</View><Text className="text-xs text-white">{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</Text></Pressable>)}</ScrollView>}
    {mode === "chart" && multiple && <View style={{ gap: 8 }}>{seriesNames.map((name, index) => <View key={index} className="flex-row items-center" style={{ gap: 8 }}><View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: /^#[\da-f]{6}$/i.test(seriesColour(index)) ? seriesColour(index) : "#ffffff" }} /><Text numberOfLines={1} className="flex-1 text-xs text-white/65">{name}</Text><TextInput value={seriesColour(index)} onChangeText={text => setSeriesColour(index, text)} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={name} className="min-h-[40px] w-28 rounded-lg border border-white/20 px-2 text-xs text-white" /></View>)}</View>}
    {mode === "table" && <View style={{ gap: 8 }}>
      <View className="flex-row" style={{ gap: 8 }}>{(["cellColour", "headerTextColour", "borderColour"] as const).map(key => <View key={key} className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: ({ cellColour: "Cells", headerTextColour: "Header text", borderColour: "Grid" })[key] })}</Text><TextInput value={tableFormat[key]} onChangeText={text => setTableFormat(value => ({ ...value, [key]: text }))} accessibilityLabel={t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: key })} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-2 text-xs text-white" /></View>)}</View>
      <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={!!tableFormat.stripeColour} onValueChange={on => setTableFormat(value => ({ ...value, stripeColour: on ? "#262626" : null }))} accessibilityLabel={t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating rows" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating rows" })}</Text>{tableFormat.stripeColour && <TextInput value={tableFormat.stripeColour} onChangeText={text => setTableFormat(value => ({ ...value, stripeColour: text }))} accessibilityLabel={t("editor.dataVisual.tableStyle.stripeColour", { defaultValue: "Alternating row colour" })} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />}</View>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["left", "centre", "right"] as const).map(align => chip(t(`editor.dataVisual.tableStyle.${align}`, { defaultValue: align === "left" ? "Left" : align === "centre" ? "Centre" : "Right" }), (tableFormat.align ?? "left") === align, () => setTableFormat(value => ({ ...value, align }))))}</View>
      <Text className="text-xs text-white/60">{t("editor.dataVisual.tableStyle.borderWidth", { defaultValue: "Grid width" })}</Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>{[0, 0.5, 1, 2, 4, 8].map(width => chip(String(width), (tableFormat.borderWidth ?? 1) === width, () => setTableFormat(value => ({ ...value, borderWidth: width }))))}</View>
    </View>}
    <Text className="text-xs text-white/60">{t(mode === "chart" ? multiple ? "editor.dataVisual.seriesHint" : "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? multiple ? "First row: Label, followed by series names. Then one label and a number for each series per row. Up to 50 data rows and six series. Turning multiple series off keeps the first series." : "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</Text>
    <Pressable accessibilityRole="button" onPress={() => { void importFile(); }} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white">{t("editor.dataVisual.import", { defaultValue: "Import CSV or TSV" })}</Text></Pressable>
    <View className="flex-row" style={{ gap: 8 }}>{(["cells", "source"] as const).map(view => chip(t(`editor.dataVisual.view.${view}`, { defaultValue: view === "cells" ? "Edit cells" : "Source data" }), dataView === view, () => setDataView(view)))}</View>
    {dataView === "cells" ? <DataCells value={data} onChange={setData} chart={mode === "chart"} multiSeries={multiple} /> : <TextInput multiline accessibilityLabel={t("editor.dataVisual.data", { defaultValue: "Data" })} value={data} onChangeText={setData} autoCorrect={false} textAlignVertical="top" className="min-h-[90px] rounded-lg border border-white/20 px-3 py-2 text-sm text-white" />}
    {mode === "chart" && <ChartFormattingPanel kind={kind} value={chartAppearance} onChange={setChartAppearance} />}
    <View className="flex-row flex-wrap" style={{ gap: 8 }}><ColourPickerButton projectId={project.id} onPick={setAccent} label={t("editor.colourPicker.accent", { defaultValue: "Pick accent from canvas" })} /><ColourPickerButton projectId={project.id} onPick={setForeground} label={t("editor.colourPicker.ink", { defaultValue: "Pick text colour from canvas" })} /></View>
    {mode === "table" && <TableFormattingPanel value={{ ...tableFormat, header: showLabels }} source={data} onChange={setTableFormat} onSource={setData} />}
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
