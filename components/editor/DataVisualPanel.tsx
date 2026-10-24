import ChartRowFilterControls from "./ChartRowFilterControls";
import { filterChartData, supportsChartRowFilters } from "../../libs/editor/chartRowFilters";
import { chartXValue } from "../../libs/editor/chartDateAxis";
import ChartCategorySummaryControls from "./ChartCategorySummaryControls";
import GraphicDraftHistoryControls from "./GraphicDraftHistoryControls";
import { useGraphicDraftHistory } from "../../libs/editor/useGraphicDraftHistory";
import PasteDataImportControls from "./PasteDataImportControls";
import DataImportMappingControls from "./DataImportMappingControls";
import type { MappedDataImport } from "../../libs/editor/dataImportMapping";
import TableRowCleanupControls from "./TableRowCleanupControls";
import DataRangeControls from "./DataRangeControls";
import ExpandedDataEditor from "./ExpandedDataEditor";
import BubbleColumnControls from "./BubbleColumnControls";
import { remapBubbleColumns } from "../../libs/editor/bubbleColumns";
import HierarchyImportControls from "./HierarchyImportControls";
import ProgressDataControls from "./ProgressDataControls";
import { isProgressChart } from "../../libs/editor/progressCharts";
import DataGraphicCaptionControls from "./DataGraphicCaptionControls";
import TableSampleGallery from "./TableSampleGallery";
import ChartSampleGallery from "./ChartSampleGallery";
import { chartDraftAppearance } from "../../libs/editor/chartDraft";
import ChartTypePicker from "./ChartTypePicker";
import { treemapDataError } from "../../libs/editor/treemapChart";
import GraphicSettingsSection from "./GraphicSettingsSection";
import { histogramChartData } from "../../libs/editor/histogramChart";
import HistogramObservationControls from "./HistogramObservationControls";
import DataGraphicFontControls from "./DataGraphicFontControls";
import TableBrandPalettes from "./TableBrandPalettes";
import ChartBrandPalettes from "./ChartBrandPalettes";
import TableFindReplaceControls from "./TableFindReplaceControls";
import TableStyleFileControls from "./TableStyleFileControls";
import { convertDataVisualSource } from "../../libs/editor/dataVisualConversion";
import ChartStyleFileControls from "./ChartStyleFileControls";
import { chartStyleAppearance } from "../../libs/editor/chartStyleFile";
import DataVisualVectorDownload from "./DataVisualVectorDownload";
import DataVisualDraftPreview from "./DataVisualDraftPreview";
import ChartTransposeControl from "./ChartTransposeControl";
import ChartStyleGallery from "./ChartStyleGallery";
import { chartSeriesEditColours } from "../../libs/editor/chartSeriesStructure";
import ChartSeriesControls from "./ChartSeriesControls";
import { reorderChartCategoryColours } from "../../libs/editor/chartDataOrder";
import ChartDataOrderControls from "./ChartDataOrderControls";
import TableStyleGallery from "./TableStyleGallery";
import { editTableStructure, type TableAxis, type TableStructureAction } from "../../libs/editor/tableStructure";
import ChartCategoryColours from "./ChartCategoryColours";
import DataExportControls from "./DataExportControls";
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from "react-native";
import { useTranslation } from "react-i18next";
import { DEFAULT_CHART, DEFAULT_TABLE, putDataVisual } from "../../libs/editor/dataVisualProject";
import { validDataVisuals, parseTableData, type ChartKind, type ChartData, type TableData } from "../../libs/editor/dataVisuals";
import { newId } from "../../libs/editor/project";
import type { ProjectSnapshot } from "../../libs/editor/types";

export default function DataVisualPanel({ project, selectedId, current, commit, select, time }: {
  project: ProjectSnapshot; selectedId: string | null; current: () => ProjectSnapshot | null;
  commit: (next: ProjectSnapshot) => void; select: (id: string) => void; time: number;
}) {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const selected = project.clips.find(c => c.id === selectedId);
  const chart = selected?.kind === "shape" ? selected.chart : undefined;
  const table = selected?.kind === "shape" ? selected.table : undefined;
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const [kind, setKind] = useState<ChartKind>("column");
  const [data, setData] = useState("");
  const [section, setSection] = useState<"data" | "design">("data");
  const [focusedCell, setFocusedCell] = useState("");
  const [dataView, setDataView] = useState<"cells" | "source">("cells");
  const [foreground, setForeground] = useState("#ffffff");
  const [accent, setAccent] = useState("#38bdf8");
  const [chartPalette, setChartPalette] = useState<string[]>([...DEFAULT_CHART.colours]);
  const [chartAppearance, setChartAppearance] = useState<ChartAppearance>({});
  const [tableFormat, setTableFormat] = useState<Omit<TableData, "rows">>({ ...DEFAULT_TABLE });
  const [multiple, setMultiple] = useState(false), [stacked, setStacked] = useState(false), [stackPercent, setStackPercent] = useState(false), [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const [error, setError] = useState("");
  const [pendingImport, setPendingImport] = useState<{ id: number; scope: string; source: string; name: string } | null>(null);
  const importScope = `${project.id}:${selectedId ?? "new"}:${mode}`;
  const importRequest = useRef(0), historyGeneration = useRef(0);
  const editData = useCallback((value: string) => { importRequest.current++; setPendingImport(null); setData(value); setError(""); }, []);
  useEffect(() => { setFocusedCell(""); setPendingImport(null); importRequest.current++; return () => { importRequest.current++; }; }, [project.id, selectedId, mode]);
  const importFile = async () => {
    const request = ++importRequest.current;
    let importedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/tab-separated-values", "text/plain", "application/octet-stream"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const file = result.assets[0]; importedUri = file?.uri;
      if (request !== importRequest.current || current()?.id !== project.id) return;
      if (!file) throw new Error("Choose a CSV or TSV file");
      if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Choose a CSV or TSV file");
      const info = await FileSystem.getInfoAsync(file.uri);
      if (!info.exists || info.isDirectory || info.size > 500000) throw new Error("Choose a CSV or TSV file smaller than 500 KB");
      const text = await FileSystem.readAsStringAsync(file.uri);
      if (request !== importRequest.current || current()?.id !== project.id) return;
      setPendingImport({ id: request, scope: importScope, source: text.replace(/^\uFEFF/, ""), name: file.name }); setError("");
    } catch (error) { if (request === importRequest.current) setError(error instanceof Error ? error.message : "Could not read this file"); }
    finally { if (importedUri && FileSystem.cacheDirectory && importedUri.startsWith(FileSystem.cacheDirectory) && importedUri !== FileSystem.cacheDirectory) await FileSystem.deleteAsync(importedUri, { idempotent: true }).catch(() => {}); }
  };
  const draftHistoryValue = { mode, kind, data, foreground, accent, chartPalette, chartAppearance, tableFormat, multiple, stacked, stackPercent, showLegend, showLabels, showValues };
  const draftHistory = useGraphicDraftHistory(`${project.id}:${selectedId ?? "new"}:${historyGeneration.current}`, draftHistoryValue, value => {
    importRequest.current++; setPendingImport(null); setFocusedCell(""); setError("");
    setMode(value.mode); setKind(value.kind); setData(value.data); setForeground(value.foreground); setAccent(value.accent);
    setChartPalette(value.chartPalette); setChartAppearance(value.chartAppearance); setTableFormat(value.tableFormat);
    setMultiple(value.multiple); setStacked(value.stacked); setStackPercent(value.stackPercent); setShowLegend(value.showLegend); setShowLabels(value.showLabels); setShowValues(value.showValues);
  });
  const choose = (value: "chart" | "table") => {
    importRequest.current++; setPendingImport(null); setMode(value); setError("");
    if (value === "chart") {
      const next = chart ?? DEFAULT_CHART;
      setChartAppearance(chartDraftAppearance(next));
      setChartPalette([...next.colours]); setKind(next.kind); setData(chartDataSource(next)); setMultiple(!!next.series?.length); setStacked(!!next.stacked); setStackPercent(!!next.stackPercent); setShowLegend(next.showLegend !== false); setForeground(next.textColour);
      setAccent(next.colours[0] ?? "#38bdf8"); setShowLabels(next.showLabels); setShowValues(next.showValues);
    } else {
      const next = table ?? DEFAULT_TABLE;
      setTableFormat({ ...next }); setData(formatDelimitedData(next.rows, "\t")); setForeground(next.textColour); setAccent(next.headerColour); setShowLabels(next.header);
    }
  };
  useEffect(() => { historyGeneration.current++; choose(table ? "table" : "chart"); }, [project.id, selected?.id, chart, table]);
  const useChartSample = (value: ChartData, colours: boolean) => {
    importRequest.current++; setPendingImport(null); setMode("chart"); setKind(value.kind); setData(chartDataSource(value)); setMultiple(!!value.series?.length);
    setChartAppearance(chartDraftAppearance(value)); setStacked(!!value.stacked); setStackPercent(!!value.stackPercent); setShowLegend(value.showLegend !== false); setShowLabels(value.showLabels); setShowValues(value.showValues);
    if (colours) { setChartPalette([...value.colours]); setAccent(value.colours[0]); setForeground(value.textColour); }
    setDataView("cells"); setError("");
  };
  const useTableSample = (value: TableData, colours: boolean) => {
    importRequest.current++; setPendingImport(null); setMode("table"); setData(formatDelimitedData(value.rows, "\t")); setShowLabels(value.header);
    const next = colours ? value : { ...value, headerColour: accent, textColour: foreground, headerTextColour: tableFormat.headerTextColour, cellColour: tableFormat.cellColour, borderColour: tableFormat.borderColour, stripeColour: tableFormat.stripeColour, cellStyles: value.cellStyles ? Object.fromEntries(Object.entries(value.cellStyles).map(([key, style]) => { const { fill, colour, ...format } = style; return [key, format]; })) : undefined };
    setTableFormat(next); if (colours) { setForeground(value.textColour); setAccent(value.headerColour); }
    setFocusedCell(""); setDataView("cells"); setError("");
  };
  const useImportedData = (result: MappedDataImport) => {
    if (!pendingImport || pendingImport.scope !== importScope) return;
    editData(result.source); setMultiple(result.multiple); setDataView("cells"); setFocusedCell("");
    if (mode === "table") { setTableFormat(previous => ({ ...previous, header: result.header, merges: undefined, cellStyles: undefined, columnWidths: undefined, rowHeights: undefined })); setShowLabels(result.header); }
    else setChartAppearance(previous => ({ ...previous, bubbleYSeries: undefined, bubbleSizeSeries: undefined }));
    setPendingImport(null);
  };
  const changeMultiple = (value: boolean) => {
    importRequest.current++;
    try { const parsed = parseChartSource(data, multiple); setData(chartDataSource({ ...DEFAULT_CHART, ...parsed }, value)); } catch { /* Keep pasted source available for correction in its new format. */ }
    setMultiple(value); if (!value) setChartAppearance(previous => ({ ...previous, bubbleYSeries: undefined, bubbleSizeSeries: undefined })); setError("");
  };
  const seriesNames = useMemo(() => {
    if (!multiple) return [];
    try { return parseChartSource(data, true).series?.map(series => series.label) ?? []; } catch { return []; }
  }, [data, multiple]);
  const categoryLabels = useMemo(() => { if ((multiple && !isProgressChart(kind) && kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "packed-circles" && kind !== "pictogram" && kind !== "bubble") || mode !== "chart" || kind === "radar") return []; try { return parseChartSource(data, multiple).rows.map(row => row.label); } catch { return []; } }, [data, multiple, mode, kind]);
  const seriesColour = (index: number) => index === 0 ? accent : chartPalette[index % chartPalette.length] ?? DEFAULT_CHART.colours[index % DEFAULT_CHART.colours.length];
  const setSeriesColour = (index: number, colour: string) => {
    if (index === 0) { setAccent(colour); return; }
    setChartPalette(previous => { const next = Array.from({ length: 6 }, (_, i) => previous[i % previous.length] ?? DEFAULT_CHART.colours[i % DEFAULT_CHART.colours.length]); next[index] = colour; return next; });
  };
  const changeTableStructure = (axis: TableAxis, index: number, action: TableStructureAction) => {
    importRequest.current++;
    try { const next = editTableStructure(data, { ...tableFormat, header: showLabels }, axis, index, action); setTableFormat(next.format); setData(next.source); setFocusedCell(axis === "row" ? `A${next.selected + 1}` : `${String.fromCharCode(65 + next.selected)}1`); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not change this table"); }
  };
  const convertDraft = () => {
    importRequest.current++;
    try {
      const next = convertDataVisualSource(data, mode, multiple, showLabels, chartAppearance.xAxisTitle);
      choose(next.mode); setData(next.source); setMultiple(next.multiple);
      if (next.mode === "table") setShowLabels(next.header);
      else if (next.xAxisTitle) setChartAppearance(previous => ({ ...previous, xAxisTitle: next.xAxisTitle }));
      setError(""); setDataView("cells");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not convert this data"); }
  };
  const previewValue = useMemo(() => {
    try {
      const value = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend, colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } } : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      return validDataVisuals(value) ? value : null;
    } catch { return null; }
  }, [mode, chart, kind, data, multiple, chartAppearance, stacked, stackPercent, showLegend, accent, chartPalette, foreground, showLabels, showValues, tableFormat]);
  const draftPreviewValue = useMemo(() => previewValue && "chart" in previewValue && previewValue.chart?.kind === "race" ? { chart: { ...previewValue.chart, raceAnimate: false } } : previewValue, [previewValue]);
  const apply = () => {
    importRequest.current++;
    if (!/^#[0-9a-f]{6}$/i.test(foreground) || !/^#[0-9a-f]{6}$/i.test(accent)) { setError(t("editor.dataVisual.invalidColour", { defaultValue: "Use a six-digit hex colour" })); return; }
    try {
      const latest = current();
      if (!latest || latest.id !== project.id) return;
      const value: { chart: ChartData } | { table: TableData } = mode === "chart" ? { chart: { ...(chart ?? DEFAULT_CHART), kind, ...parseChartSource(data, multiple), ...chartAppearance, stacked, stackPercent, showLegend,
        colours: [accent, ...chartPalette.slice(1)], textColour: foreground, showLabels, showValues } }
        : { table: { ...tableFormat, rows: parseTableData(data), textColour: foreground, headerColour: accent, header: showLabels } };
      if ("chart" in value && (kind === "scatter" || kind === "bubble") && value.chart.rows.some(row => !Number.isFinite(chartXValue(row.label, chartAppearance.xAxisMode)))) throw new Error(chartAppearance.xAxisMode === "date" ? "Use ISO dates or UTC timestamps in the first data column" : "Scatter and bubble charts need numeric X coordinates in the first column, within one trillion");
      if ("chart" in value && kind === "funnel" && (value.chart.rows.some(row => row.value < 0) || !value.chart.rows.some(row => row.value > 0))) throw new Error("Funnel stages need nonnegative values and at least one positive stage");
      if ("chart" in value && kind === "area" && chartAppearance.areaMode && chartAppearance.areaMode !== "overlay" && (value.chart.rows.some(row => row.value < 0) || value.chart.series?.some(series => series.values.some(value => value < 0)))) throw new Error("Stacked, proportional and streamgraph areas need nonnegative source values. Use overlapping areas for negative data");
      if ("chart" in value && kind === "bubble") { const sizes = value.chart.series?.[value.chart.bubbleSizeSeries ?? 1]; if (sizes && (sizes.values.some(size => size < 0) || !sizes.values.some(size => size > 0))) throw new Error("Bubble sizes need nonnegative values and at least one positive size"); }
      if ("chart" in value && (kind === "treemap" || kind === "packed-circles")) { const issue = treemapDataError(value.chart.rows); if (issue) throw new Error(issue); }
      if ("chart" in value && kind === "pictogram" && value.chart.pictogramMode !== "progress" && (value.chart.rows.some(row => row.value < 0) || !value.chart.rows.some(row => row.value > 0))) throw new Error("Pictograms need nonnegative values and at least one positive category");
      if ("chart" in value && kind === "race" && (!value.chart.series || value.chart.series.length < 2 || value.chart.series.some(frame => frame.values.some(number => number < 0)) || !value.chart.series.some(frame => frame.values.some(number => number > 0)))) throw new Error("Bar chart races need at least two nonnegative frame columns and one positive value");
      if ("chart" in value && isProgressChart(kind) && (value.chart.rows[0]?.value < 0 || value.chart.rows[0]?.value > 100)) throw new Error("Progress charts need a first value from 0 to 100");
      if ("chart" in value && kind === "pictogram" && value.chart.pictogramMode === "progress" && (!Number.isInteger(value.chart.rows[0]?.value) || value.chart.rows[0]?.value < 0 || value.chart.rows[0]?.value > (value.chart.pictogramCount ?? 100))) throw new Error("Use a whole filled-item count between zero and the total symbols");
      if (!validDataVisuals(value)) throw new Error("Use valid colours and table formatting");
      if (("chart" in value && !value.chart.rows.length) || ("table" in value && !value.table.rows.length)) throw new Error("Enter at least one row");
      const result = putDataVisual(latest, time, value, () => newId(10), selectedId);
      if (result) { commit(result.project); select(result.id); }
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid data"); }
  };
  const chip = (label: string, active: boolean, onPress: () => void) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg border px-3 ${active ? "border-white bg-white" : "border-white/20"}`}><Text className={`text-xs ${active ? "text-black" : "text-white"}`}>{label}</Text></Pressable>;
  return <View style={{ maxHeight: Math.max(160, Math.min(540, windowHeight * 0.52)), gap: 8 }}>
    <View className="flex-row rounded-lg bg-white/5 p-1" style={{ gap: 4, marginHorizontal: 12 }}>{(["data", "design"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)} className={`min-h-[44px] flex-1 items-center justify-center rounded-md ${section === value ? "bg-white/15" : ""}`}><Text className={`text-xs font-semibold ${section === value ? "text-white" : "text-white/55"}`}>{t(`editor.dataVisual.section.${value}`, { defaultValue: value === "data" ? "Data" : "Design" })}</Text></Pressable>)}</View>
    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}>{chip(t("editor.dataVisual.chart", { defaultValue: "Chart" }), mode === "chart", () => choose("chart"))}{chip(t("editor.dataVisual.table", { defaultValue: "Table" }), mode === "table", () => choose("table"))}</View>
    {mode === "chart" && <ChartTypePicker value={kind} onChange={setKind} />}
    <GraphicDraftHistoryControls {...draftHistory} />
    <DataVisualDraftPreview key={project.id} projectId={project.id} value={draftPreviewValue} width={project.settings.width * (selected?.kind === "shape" && (chart || table) ? selected.w : 0.8)} height={project.settings.height * (selected?.kind === "shape" && (chart || table) ? selected.h : 0.65)} background={project.settings.background} />
    {section === "data" ? <>
    {mode === "table" && <TableSampleGallery onUse={useTableSample} />}
    {mode === "chart" && <ChartSampleGallery onUse={useChartSample} />}
    {mode === "chart" && <View style={{ gap: 8 }}><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={multiple} onValueChange={changeMultiple} accessibilityLabel={t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.multipleSeries", { defaultValue: "Multiple data series" })}</Text></View>{multiple && <>{!isProgressChart(kind) && kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "packed-circles" && kind !== "bubble" && kind !== "histogram" && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={showLegend} onValueChange={setShowLegend} accessibilityLabel={t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })}</Text></View>}{(kind === "bar" || kind === "column") && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={stacked} onValueChange={setStacked} accessibilityLabel={t("editor.dataVisual.stacked", { defaultValue: "Stack series" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.stacked", { defaultValue: "Stack series" })}</Text></View>}{(kind === "pie" || kind === "donut" || kind === "funnel" || kind === "treemap" || kind === "packed-circles" || kind === "pictogram" || kind === "histogram") && <Text className="text-xs text-white/45">{t("editor.dataVisual.singleSeriesViewHint", { defaultValue: "This chart displays the first data series; other series remain in the source." })}</Text>}</>}</View>}
    <Text className="text-xs text-white/60">{t(mode === "chart" ? multiple ? "editor.dataVisual.seriesHint" : "editor.dataVisual.chartHint" : "editor.dataVisual.tableHint", { defaultValue: mode === "chart" ? multiple ? "First row: Label, followed by series names. Then one label and a number for each series per row. Up to 50 data rows and six series. Turning multiple series off keeps the first series." : "One label,value pair per line. Up to 50 rows. Paste tab-separated spreadsheet data too." : "One row per line. Separate cells with commas or tabs. Up to 20 rows and 12 columns." })}</Text>
    <Pressable accessibilityRole="button" onPress={() => { void importFile(); }} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white">{t("editor.dataVisual.import", { defaultValue: "Import CSV or TSV" })}</Text></Pressable>
    <PasteDataImportControls key={importScope} onPrepare={source => { const id = ++importRequest.current; setPendingImport({ id, scope: importScope, source, name: t("editor.dataImport.pastedName", { defaultValue: "pasted spreadsheet" }) }); setError(""); }} />
    {pendingImport && pendingImport.scope === importScope && <DataImportMappingControls key={pendingImport.id} source={pendingImport.source} name={pendingImport.name} mode={mode} defaultMultiple={multiple} defaultHeader={showLabels} hierarchy={mode === "chart" && (kind === "treemap" || kind === "packed-circles")} numericX={mode === "chart" && (kind === "scatter" || kind === "bubble")} dateX={mode === "chart" && (kind === "scatter" || kind === "bubble") && chartAppearance.xAxisMode === "date"} onUse={useImportedData} onCancel={() => setPendingImport(null)} />}
    <View className="flex-row" style={{ gap: 8 }}>{(["cells", "source"] as const).map(view => chip(t(`editor.dataVisual.view.${view}`, { defaultValue: view === "cells" ? "Edit cells" : "Source data" }), dataView === view, () => setDataView(view)))}</View>
    <DataRangeControls key={`${project.id}:${selected?.id ?? "new"}:${mode}`} source={data} onChange={editData} chart={mode === "chart"} multiple={multiple} />
    <ExpandedDataEditor identity={`${project.id}:${selected?.id ?? "new"}:${mode}`} value={data} onChange={editData} chart={mode === "chart"} multiple={multiple} onCellFocus={mode === "table" ? setFocusedCell : undefined} onStructure={mode === "table" ? changeTableStructure : undefined} />
    {dataView === "cells" ? <DataCells value={data} onChange={editData} chart={mode === "chart"} multiSeries={multiple} onCellFocus={mode === "table" ? setFocusedCell : undefined} onStructure={mode === "table" ? changeTableStructure : undefined} /> : <TextInput multiline accessibilityLabel={t("editor.dataVisual.data", { defaultValue: "Data" })} value={data} onChangeText={editData} autoCorrect={false} textAlignVertical="top" className="min-h-[90px] rounded-lg border border-white/20 px-3 py-2 text-sm text-white" />}
    {mode === "chart" && kind === "scatter" && <Text className="text-xs text-white/55">{t("editor.charts.scatterHint", { defaultValue: "Scatter plots use numeric X coordinates in the first column and Y values in the remaining columns. Multiple series share those X coordinates. Choose Dates and UTC times in Axes and scale for an elapsed-time horizontal axis." })}</Text>}
    {mode === "chart" && kind === "bubble" && <View style={{ gap: 8 }}><Text className="text-xs text-white/55">{t("editor.charts.bubbleHint", { defaultValue: "Use numeric X coordinates in the first column. In multiple-series mode, choose the Y and size columns below; defaults use the first series for Y and the second for size. Areas are proportional to size; zero sizes are hidden. Without a size series, bubbles are equal. Extra series stay in the source data. Value labels show Y / size. Axes and scale can use dates and UTC times for X." })}</Text><Pressable accessibilityRole="button" onPress={() => { editData("X\tY\tSize\n10\t20\t15\n25\t35\t40\n40\t15\t25\n55\t45\t60"); setMultiple(true); }} className="min-h-[40px] self-start justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.charts.bubbleExample", { defaultValue: "Replace draft with bubble example" })}</Text></Pressable></View>}
    {mode === "chart" && (kind === "treemap" || kind === "packed-circles") && <View style={{ gap: 8 }}><Text className="text-xs text-white/55">{t("editor.charts.treemapHint", { defaultValue: "Use unique leaf paths such as Europe / France and Europe / Germany. Up to six levels are supported. Values must be nonnegative, with at least one positive value. Zero values are hidden. A path cannot be both a group and a leaf. The first series supplies values; other source series are retained." })}</Text><Pressable accessibilityRole="button" onPress={() => { editData("Europe / France\t35\nEurope / Germany\t45\nAmericas / Brazil\t25\nAmericas / Canada\t30\nAsia / Japan\t40\nAsia / Korea\t20"); setMultiple(false); }} className="min-h-[40px] self-start justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.charts.treemapExample", { defaultValue: "Replace draft with hierarchy example" })}</Text></Pressable></View>}
    {mode === "chart" && kind === "pictogram" && chartAppearance.pictogramMode === "progress" && <ProgressDataControls source={data} multiple={multiple} onChange={editData} items total={chartAppearance.pictogramCount ?? 100} />}
    {mode === "chart" && isProgressChart(kind) && <ProgressDataControls source={data} multiple={multiple} onChange={editData} />}
    {mode === "chart" && kind === "bubble" && <BubbleColumnControls names={seriesNames} value={chartAppearance} onChange={patch => setChartAppearance(previous => ({ ...previous, ...patch }))} />}
    {mode === "chart" && kind === "race" && <View style={{ gap: 8 }}><Text className="text-xs text-white/55">{t("editor.charts.raceHint", { defaultValue: "Use multiple-series data with categories in the first column. The following two to six columns are successive frames; their names appear as frame captions. Values must be nonnegative. Categories keep their colours as rankings change. Playback spans the graphic’s timeline duration." })}</Text><Pressable accessibilityRole="button" onPress={() => { editData("Category\t2024\t2025\t2026\nNorth\t35\t55\t75\nSouth\t60\t45\t80\nEast\t25\t70\t65\nWest\t50\t65\t90"); setMultiple(true); }} className="min-h-[40px] self-start justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t("editor.charts.raceExample", { defaultValue: "Replace draft with ranking example" })}</Text></Pressable></View>}
    {mode === "chart" && kind === "funnel" && <Text className="text-xs text-white/55">{t("editor.charts.funnelHint", { defaultValue: "Stages follow row order. Use nonnegative values with at least one positive stage. Stage colours, labels and values are edited separately." })}</Text>}
    {mode === "chart" && multiple && <ChartSeriesControls source={data} onChange={(source, order) => { importRequest.current++; if (kind === "bubble") setChartAppearance(previous => ({ ...previous, ...remapBubbleColumns(previous, order) })); const colours = ["race", "funnel", "treemap", "packed-circles", "pictogram", "bubble", "histogram"].includes(kind) ? [accent, ...chartPalette.slice(1)] : chartSeriesEditColours([accent, ...chartPalette.slice(1)], order, DEFAULT_CHART.colours); setData(source); setChartPalette(colours); setAccent(colours[0]); setError(""); }} />}
    {mode === "chart" && <ChartTransposeControl source={data} multiple={multiple} disabled={isProgressChart(kind) || kind === "pictogram" || kind === "scatter" || kind === "pie" || kind === "donut" || kind === "histogram" || kind === "bubble"} onChange={source => { importRequest.current++; setData(source); setMultiple(true); setError(""); }} />}
    {mode === "chart" && kind !== "histogram" && !isProgressChart(kind) && !(kind === "pictogram" && chartAppearance.pictogramMode === "progress") && <ChartDataOrderControls xAxisMode={chartAppearance.xAxisMode} scatter={kind === "scatter" || kind === "bubble"} source={data} multiple={multiple} onChange={(source, order) => { importRequest.current++; setData(source); if ((!multiple || kind === "race" || kind === "funnel" || kind === "treemap" || kind === "packed-circles" || kind === "pictogram" || kind === "bubble") && kind !== "radar") { const colours = reorderChartCategoryColours([accent, ...chartPalette.slice(1)], order); setChartPalette(colours); setAccent(colours[0]); } setError(""); }} />}
    {mode === "chart" && supportsChartRowFilters({ kind, pictogramMode: chartAppearance.pictogramMode }) && <ChartRowFilterControls key={importScope} source={data} multiple={multiple} value={chartAppearance.filters} title={project.title + "-displayed"} onChange={filters => setChartAppearance(previous => ({ ...previous, filters }))} />}
    {mode === "chart" && !isProgressChart(kind) && !["histogram", "scatter", "bubble"].includes(kind) && !(kind === "pictogram" && chartAppearance.pictogramMode === "progress") && <ChartCategorySummaryControls source={data} multiple={multiple} onChange={(source, order) => { editData(source); if ((!multiple || ["race", "funnel", "treemap", "packed-circles", "pictogram"].includes(kind)) && kind !== "radar") { const colours = reorderChartCategoryColours([accent, ...chartPalette.slice(1)], order); setChartPalette(colours); setAccent(colours[0]); } }} />}
    {mode === "table" && <TableRowCleanupControls key={`${project.id}:${selected?.id ?? "new"}`} source={data} value={{ ...tableFormat, header: showLabels }} onApply={next => { importRequest.current++; setData(next.source); setTableFormat(next.format); setShowLabels(next.format.header); setFocusedCell(""); setError(""); }} />}
    {mode === "table" && <TableFindReplaceControls source={data} onChange={editData} />}
    {mode === "chart" && (kind === "treemap" || kind === "packed-circles") && <HierarchyImportControls key={`${project.id}:${selected?.id ?? "new"}:${kind}`} onChange={source => { editData(source); setMultiple(false); }} />}
    {mode === "chart" && kind === "histogram" && <HistogramObservationControls key={`${project.id}:${selected?.id ?? "new"}`} onChange={source => { editData(source); setMultiple(false); }} />}
    {mode === "chart" && kind === "histogram" && previewValue && "chart" in previewValue && previewValue.chart && <GraphicSettingsSection title={t("editor.charts.binCounts", { defaultValue: "Export histogram bin counts" })}><DataExportControls source={formatDelimitedData([["Value range", "Frequency"], ...histogramChartData(filterChartData(previewValue.chart)).rows.map(row => [row.label, row.value])], "\t")} mode="chart" multiple={true} title={project.title + "-bins"} /></GraphicSettingsSection>}
    <DataExportControls source={data} mode={mode} multiple={multiple} title={project.title} />
    <Pressable accessibilityRole="button" onPress={convertDraft} className="min-h-[40px] items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/75">{t(mode === "chart" ? "editor.dataVisual.convertToTable" : "editor.dataVisual.convertToChart", { defaultValue: mode === "chart" ? "Use this data as a table" : "Use this data as a chart" })}</Text></Pressable>
    </> : <>
    <View className="flex-row items-center" style={{ gap: 8 }}>
      <Text className="text-xs text-white/60">{t("editor.dataVisual.textColour", { defaultValue: "Text" })}</Text><TextInput accessibilityLabel={t("editor.dataVisual.textColour", { defaultValue: "Text" })} value={foreground} onChangeText={setForeground} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
      <Text className="text-xs text-white/60">{t("editor.dataVisual.accent", { defaultValue: "Accent" })}</Text><TextInput accessibilityLabel={t("editor.dataVisual.accent", { defaultValue: "Accent" })} value={accent} onChangeText={setAccent} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />
    </View>
    {mode === "chart" && (!multiple || kind === "race" || kind === "funnel" || kind === "treemap" || kind === "packed-circles" || kind === "pictogram" || kind === "bubble") && kind !== "radar" && kind !== "histogram" && !isProgressChart(kind) && !(kind === "pictogram" && chartAppearance.pictogramMode === "progress") && <ChartCategoryColours key={project.id + ":" + (selected?.id ?? "new")} labels={categoryLabels} colours={[accent, ...chartPalette.slice(1)]} onChange={colours => { setChartPalette(colours); setAccent(colours[0]); }} projectId={project.id} />}
    {mode === "chart" && <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{DESIGN_PALETTES.map(palette => <Pressable key={palette.id} accessibilityRole="button" onPress={() => { setChartPalette([...palette.colours]); setAccent(palette.colours[0]); }} className="min-h-[40px] justify-center rounded-lg border border-white/20 px-3" style={{ gap: 4 }}><View className="flex-row overflow-hidden rounded">{palette.colours.map(colour => <View key={colour} style={{ width: 14, height: 12, backgroundColor: colour }} />)}</View><Text className="text-xs text-white">{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</Text></Pressable>)}</ScrollView>}
    {mode === "chart" && multiple && !isProgressChart(kind) && kind !== "race" && kind !== "funnel" && kind !== "treemap" && kind !== "packed-circles" && kind !== "pictogram" && kind !== "bubble" && kind !== "histogram" && <View style={{ gap: 8 }}>{seriesNames.map((name, index) => <View key={index} className="flex-row items-center" style={{ gap: 8 }}><View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: /^#[\da-f]{6}$/i.test(seriesColour(index)) ? seriesColour(index) : "#ffffff" }} /><Text numberOfLines={1} className="flex-1 text-xs text-white/65">{name}</Text><TextInput value={seriesColour(index)} onChangeText={text => setSeriesColour(index, text)} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={name} className="min-h-[40px] w-28 rounded-lg border border-white/20 px-2 text-xs text-white" /></View>)}</View>}
    {mode === "table" && <View style={{ gap: 8 }}>
      <View className="flex-row" style={{ gap: 8 }}>{(["cellColour", "headerTextColour", "borderColour"] as const).map(key => <View key={key} className="flex-1" style={{ gap: 4 }}><Text className="text-xs text-white/60">{t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: ({ cellColour: "Cells", headerTextColour: "Header text", borderColour: "Grid" })[key] })}</Text><TextInput value={tableFormat[key]} onChangeText={text => setTableFormat(value => ({ ...value, [key]: text }))} accessibilityLabel={t(`editor.dataVisual.tableStyle.${key}`, { defaultValue: key })} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] rounded-lg border border-white/20 px-2 text-xs text-white" /></View>)}</View>
      <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={!!tableFormat.stripeColour} onValueChange={on => setTableFormat(value => ({ ...value, stripeColour: on ? "#262626" : null }))} accessibilityLabel={t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating cells" })} /><Text className="text-xs text-white/70">{t("editor.dataVisual.tableStyle.stripes", { defaultValue: "Alternating cells" })}</Text>{tableFormat.stripeColour && <TextInput value={tableFormat.stripeColour} onChangeText={text => setTableFormat(value => ({ ...value, stripeColour: text }))} accessibilityLabel={t("editor.dataVisual.tableStyle.stripeColour", { defaultValue: "Alternating row colour" })} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-2 text-xs text-white" />}</View>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>{(["left", "centre", "right"] as const).map(align => chip(t(`editor.dataVisual.tableStyle.${align}`, { defaultValue: align === "left" ? "Left" : align === "centre" ? "Centre" : "Right" }), (tableFormat.align ?? "left") === align, () => setTableFormat(value => ({ ...value, align }))))}</View>
      <Text className="text-xs text-white/60">{t("editor.dataVisual.tableStyle.borderWidth", { defaultValue: "Grid width" })}</Text>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>{[0, 0.5, 1, 2, 4, 8].map(width => chip(String(width), (tableFormat.borderWidth ?? 1) === width, () => setTableFormat(value => ({ ...value, borderWidth: width }))))}</View>
    </View>}
    {mode === "chart" && multiple && stacked && (kind === "bar" || kind === "column") && <View style={{ gap: 6 }}><View className="flex-row items-center" style={{ gap: 8 }}><Switch value={stackPercent} onValueChange={setStackPercent} accessibilityLabel={t("editor.charts.percentStack", { defaultValue: "100% stacked" })} /><Text className="text-xs text-white/75">{t("editor.charts.percentStack", { defaultValue: "100% stacked" })}</Text></View>{stackPercent && <Text className="text-[10px] text-white/45">{t("editor.charts.percentStackHint", { defaultValue: "Each category shows percentage shares. Positive and negative values each total 100% on their side of zero. Source values stay in the data grid and CSV downloads." })}</Text>}</View>}
    {mode === "chart" && (isProgressChart(kind) || kind === "pictogram" && chartAppearance.pictogramMode === "progress") && <View className="flex-row items-center" style={{ gap: 8 }}><Text className="flex-1 text-xs text-white/65">{t("editor.charts.progressTrack", { defaultValue: "Remaining track" })}</Text><TextInput value={seriesColour(1)} onChangeText={colour => setSeriesColour(1, colour)} maxLength={7} autoCapitalize="none" autoCorrect={false} accessibilityLabel={t("editor.charts.progressTrack", { defaultValue: "Remaining track" })} className="min-h-[40px] w-28 rounded-lg border border-white/20 px-3 text-xs text-white" /></View>}
    {mode === "chart" && !multiple && ["pie", "donut", "pictogram"].includes(kind) && <View className="flex-row items-center" style={{ gap: 8 }}><Switch value={showLegend} onValueChange={setShowLegend} accessibilityLabel={t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })} /><Text className="text-xs text-white/65">{t("editor.dataVisual.showLegend", { defaultValue: "Show legend" })}</Text></View>}
    <DataGraphicCaptionControls value={mode === "chart" ? chartAppearance : tableFormat} onChange={metadata => mode === "chart" ? setChartAppearance(previous => ({ ...previous, ...metadata })) : setTableFormat(previous => ({ ...previous, ...metadata }))} />
    <DataGraphicFontControls value={mode === "chart" ? chartAppearance.fontFamily : tableFormat.fontFamily} onChange={fontFamily => mode === "chart" ? setChartAppearance(previous => ({ ...previous, fontFamily })) : setTableFormat(previous => ({ ...previous, fontFamily }))} />
    {mode === "chart" && <ChartBrandPalettes value={[accent, ...chartPalette.slice(1)]} onChange={colours => { setChartPalette(colours); setAccent(colours[0]); }} />}
    {mode === "chart" && <ChartStyleFileControls key={`${project.id}:${selected?.id ?? "new"}`} value={previewValue && "chart" in previewValue ? previewValue.chart ?? null : null} title={project.title} onApply={(style, numbers) => { setChartAppearance(previous => ({ ...previous, ...chartStyleAppearance(style), ...(numbers ? { valueFormat: style.valueFormat, xValueFormat: style.xValueFormat } : {}) })); setChartPalette([...style.colours]); setAccent(style.colours[0]); setForeground(style.textColour); setShowLabels(style.showLabels); setShowValues(style.showValues); setShowLegend(style.showLegend !== false); }} />}
    {mode === "chart" && <ChartStyleGallery value={chartAppearance} onApply={(preset, colours) => { setChartAppearance(previous => ({ ...previous, ...preset.geometry, ...((kind === "scatter" || kind === "bubble" || kind === "dot") ? { pointSize: Math.max(0.5, preset.geometry.pointSize ?? 1) } : {}) })); if (colours) { setChartPalette([...preset.colours]); setAccent(preset.colours[0]); } }} />}
    {mode === "chart" && <ChartFormattingPanel samples={(previewValue && "chart" in previewValue && previewValue.chart ? kind === "bubble" ? previewValue.chart.series?.[previewValue.chart.bubbleYSeries ?? 0]?.values ?? previewValue.chart.rows.map(row => row.value) : previewValue.chart.series?.flatMap(series => series.values) ?? previewValue.chart.rows.map(row => row.value) : []).filter((sample): sample is number => sample !== null)} percentStack={isProgressChart(kind) || kind === "area" && chartAppearance.areaMode === "percent" || multiple && stacked && stackPercent && (kind === "bar" || kind === "column")} multiple={multiple} kind={kind} value={chartAppearance} onChange={setChartAppearance} />}
    <View className="flex-row flex-wrap" style={{ gap: 8 }}><ColourPickerButton projectId={project.id} onPick={setAccent} label={t("editor.colourPicker.accent", { defaultValue: "Pick accent from canvas" })} /><ColourPickerButton projectId={project.id} onPick={setForeground} label={t("editor.colourPicker.ink", { defaultValue: "Pick text colour from canvas" })} /></View>
    {mode === "table" && <TableBrandPalettes value={{ ...tableFormat, headerColour: accent, textColour: foreground }} onChange={value => { setTableFormat(value); setAccent(value.headerColour); setForeground(value.textColour); }} />}
    {mode === "table" && <TableStyleFileControls key={`${project.id}:${selected?.id ?? "new"}`} value={previewValue && "table" in previewValue ? previewValue.table ?? null : null} title={project.title} onApply={(style, headers) => { setTableFormat(previous => ({ ...previous, ...style, header: headers ? style.header : previous.header, headerColumn: headers ? style.headerColumn : previous.headerColumn })); setForeground(style.textColour); setAccent(style.headerColour); if (headers) setShowLabels(style.header); }} />}
    {mode === "table" && <TableStyleGallery value={{ ...tableFormat, textColour: foreground, headerColour: accent }} onChange={value => { setTableFormat(value); setForeground(value.textColour); setAccent(value.headerColour); }} />}
    {mode === "table" && <TableFormattingPanel focusedCell={focusedCell} value={{ ...tableFormat, header: showLabels }} source={data} onChange={value => { setTableFormat(value); setShowLabels(value.header); }} onSource={editData} />}
    <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
      <Switch accessibilityLabel={t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })} value={showLabels} onValueChange={setShowLabels} /><Text className="text-xs text-white/70">{t(mode === "chart" ? "editor.dataVisual.labels" : "editor.dataVisual.header", { defaultValue: mode === "chart" ? "Show labels" : "Header row" })}</Text>
      {mode === "chart" && <><Switch accessibilityLabel={t("editor.dataVisual.values", { defaultValue: "Show values" })} value={showValues} onValueChange={setShowValues} /><Text className="text-xs text-white/70">{t("editor.dataVisual.values", { defaultValue: "Show values" })}</Text></>}
    </View>
    </>}
    <DataVisualVectorDownload key={`${project.id}:${selected?.id ?? "new"}`} projectId={project.id} value={previewValue} width={project.settings.width * (selected?.kind === "shape" && (chart || table) ? selected.w : 0.8)} height={project.settings.height * (selected?.kind === "shape" && (chart || table) ? selected.h : 0.65)} title={project.title} />
    </ScrollView>
    <View className="border-t border-white/10 pt-2" style={{ gap: 6, marginHorizontal: 12 }}>
    <View className="flex-row" style={{ gap: 8 }}><Pressable accessibilityRole="button" onPress={() => choose(mode)} className="min-h-[40px] flex-1 items-center justify-center rounded-lg border border-white/20 px-3"><Text className="text-xs text-white/65">{t("editor.dataVisual.resetDraft", { defaultValue: "Reset draft" })}</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={!!selected?.locked && !!(chart || table)} onPress={apply} className="min-h-[40px] flex-1 items-center justify-center rounded-lg bg-white px-3"><Text className="text-xs font-semibold text-black">{t(chart || table ? "editor.dataVisual.update" : "editor.dataVisual.insert", { defaultValue: chart || table ? "Update graphic" : "Insert graphic" })}</Text></Pressable>
    </View>
    {error !== "" && <Text accessibilityRole="alert" className="text-xs text-red-300">{error}</Text>}
    </View>
  </View>;
}
