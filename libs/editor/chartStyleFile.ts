import { validDataVisuals, type ChartData } from "./dataVisuals";
export type PortableChartStyle = Pick<ChartData, "scaleIntervals" | "scaleXIntervals" | "xDateFormat" | "xDateLocale" | "pointShape" | "linePattern" | "seriesPatterns" | "labelEvery" | "labelAngle" | "labelWrap" | "xValueFormat" | "pointLabelMode" | "progressThickness" | "progressRounded" | "colours" | "textColour" | "showLabels" | "showValues" | "showLegend" | "valueFormat" | "pieRotation" | "pieGap" | "pieValueMode" | "donutHole" | "donutTotal" | "legendPosition" | "lineWidth" | "scatterLines" | "lineStyle" | "pictogramSymbol" | "pictogramMode" | "pictogramCount" | "pictogramColumns" | "pictogramShape" | "fontFamily" | "fontScale" | "pointSize" | "areaOpacity" | "barGap" | "showGrid" | "showAxisValues">;
export function chartStyleAppearance(style: PortableChartStyle) {
  return { labelEvery: style.labelEvery, labelAngle: style.labelAngle, scaleIntervals: style.scaleIntervals, scaleXIntervals: style.scaleXIntervals, xDateFormat: style.xDateFormat, xDateLocale: style.xDateLocale, pointShape: style.pointShape, linePattern: style.linePattern, seriesPatterns: style.seriesPatterns, labelWrap: style.labelWrap, pointLabelMode: style.pointLabelMode, progressThickness: style.progressThickness, progressRounded: style.progressRounded, pictogramSymbol: style.pictogramSymbol, pictogramMode: style.pictogramMode, pictogramCount: style.pictogramCount, pictogramColumns: style.pictogramColumns, pictogramShape: style.pictogramShape, fontFamily: style.fontFamily, fontScale: style.fontScale, pieRotation: style.pieRotation, pieGap: style.pieGap, pieValueMode: style.pieValueMode, scatterLines: style.scatterLines, donutHole: style.donutHole, donutTotal: style.donutTotal, legendPosition: style.legendPosition, lineWidth: style.lineWidth, lineStyle: style.lineStyle, pointSize: style.pointSize, areaOpacity: style.areaOpacity, barGap: style.barGap, showGrid: style.showGrid, showAxisValues: style.showAxisValues };
}
export function captureChartStyle(chart: ChartData): PortableChartStyle {
  const style = { ...chartStyleAppearance(chart), xValueFormat: chart.xValueFormat ? { ...chart.xValueFormat } : undefined, colours: [...chart.colours], textColour: chart.textColour, showLabels: chart.showLabels, showValues: chart.showValues, showLegend: chart.showLegend, valueFormat: chart.valueFormat ? { style: chart.valueFormat.style, currency: chart.valueFormat.currency, decimals: chart.valueFormat.decimals, compact: chart.valueFormat.compact, locale: chart.valueFormat.locale, prefix: chart.valueFormat.prefix, suffix: chart.valueFormat.suffix } : undefined };
  if (!validDataVisuals({ chart: { ...style, kind: "column", rows: [{ label: "Sample", value: 1 }] } })) throw new Error("Choose valid chart formatting before exporting its style");
  return style;
}
export function chartStyleFile(chart: ChartData, name: string): string {
  return JSON.stringify({ kind: "dehub-chart-style", version: 1, name: name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Chart style", style: captureChartStyle(chart) }) + "\n";
}
export function parseChartStyleFile(text: string): { name: string; style: PortableChartStyle } {
  if (text.length > 32768) throw new Error("Choose a chart-style file smaller than 32 KB");
  let raw: unknown; try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { throw new Error("Choose an exported chart-style JSON file"); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Choose an exported chart-style file");
  const file = raw as Record<string, unknown>;
  if (file.kind !== "dehub-chart-style" || file.version !== 1 || typeof file.name !== "string" || !file.style || typeof file.style !== "object" || Array.isArray(file.style)) throw new Error("Choose a supported chart-style file");
  const style = file.style as PortableChartStyle;
  if (!validDataVisuals({ chart: { ...style, kind: "column", rows: [{ label: "Sample", value: 1 }] } })) throw new Error("This file contains invalid chart formatting");
  const safe = captureChartStyle({ ...style, kind: "column", rows: [{ label: "Sample", value: 1 }] });
  return { name: file.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60) || "Chart style", style: safe };
}
