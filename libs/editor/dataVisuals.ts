import { filterChartData, validChartRowFilters, type ChartRowFilter } from "./chartRowFilters";
import type { ChartAreaMode } from "./stackedAreaBands";
import { chartXValue, CHART_DATE_MIN, CHART_DATE_MAX, type ChartDateFormat } from "./chartDateAxis";
import { drawGraphicText } from "./graphicText";
import { drawChartMarker, strokeChartPattern, type ChartPointShape, type ChartLinePattern } from "./chartMarks";
import { validPictogramSymbol } from "./pictogramSymbol";
import { drawChartCategoryLabel, showChartCategoryLabel, chartCategoryLabelSpace, chartCategoryLabelWidth, drawAngledCategoryLabel } from "./chartCategoryLabel";
import { drawPackedCirclesChart } from "./packedCirclesChart";
import { drawProgressChart, isProgressChart } from "./progressCharts";
import { drawChartRace } from "./chartRace";
import { drawPictogramChart } from "./pictogramChart";
import { drawTreemapChart, treemapDataError } from "./treemapChart";
import { histogramChartData } from "./histogramChart";
import { drawFunnelChart } from "./funnelChart";
import { graphicFontCss, validGraphicFont } from "./graphicFonts";
import { drawChartReference } from "./chartReference";
import { traceChartLine, type ChartLineStyle } from "./chartLineStyle";
import { drawChartLegend, type ChartLegendPosition } from "./chartLegend";
import { CHART_NUMBER_LOCALES, chartValueLabel, validChartValueFormat, type ChartValueFormat } from "./chartValueFormat";
import { validTableCellStyles, type TableCellStyles } from "./tableCellStyles";
import { validTableMerges, type TableMerge } from "./tableMerges";
import { parseDelimitedData } from "./delimitedData";
import { drawMultiSeriesChart } from "./multiSeriesCharts";
import { drawEditableTable } from "./tableRendering";
export const CHART_KINDS = ["column", "bar", "line", "area", "lollipop", "dot", "pie", "donut", "radar", "scatter", "bubble", "funnel", "histogram", "treemap", "pictogram", "race", "progress-bar", "progress-ring", "radial-progress", "progress-dial", "packed-circles"] as const;
export type ChartKind = typeof CHART_KINDS[number];
export interface ChartData {
  scaleIntervals?: number;
  scaleXIntervals?: number;
  filters?: ChartRowFilter[];
  areaMode?: ChartAreaMode;
  xAxisMode?: "number" | "date";
  xDateFormat?: ChartDateFormat;
  xDateLocale?: import("./chartValueFormat").ChartValueFormat["locale"];
  pointShape?: ChartPointShape;
  linePattern?: ChartLinePattern;
  seriesPatterns?: boolean;
  labelEvery?: number;
  labelAngle?: number;
  labelWrap?: boolean;
  xValueFormat?: ChartValueFormat;
  pointLabelMode?: "value" | "coordinates";
  bubbleYSeries?: number;
  bubbleSizeSeries?: number;
  progressThickness?: number;
  progressRounded?: boolean;
  title?: string;
  caption?: string;
  description?: string;
  raceTop?: number;
  racePoster?: number;
  raceAnimate?: boolean;
  pictogramSymbol?: string;
  pictogramMode?: "shares" | "progress";
  pictogramCount?: number;
  pictogramColumns?: number;
  pictogramShape?: "circle" | "square" | "diamond" | "star" | "person" | "symbol";
  histogramBins?: number;
  fontFamily?: string;
  fontScale?: number;
  referenceLine?: { value: number; label?: string; colour: string };
  valueFormat?: ChartValueFormat;
  pieRotation?: number;
  pieGap?: number;
  pieValueMode?: "auto" | "percent" | "value" | "both";
  donutHole?: number;
  xAxisTitle?: string;
  yAxisTitle?: string;
  donutLabel?: string;
  donutTotal?: boolean;
  legendPosition?: ChartLegendPosition;
  lineWidth?: number;
  lineStyle?: ChartLineStyle;
  scatterLines?: boolean;
  scaleXMin?: number;
  scaleXMax?: number;
  pointSize?: number;
  areaOpacity?: number;
  barGap?: number;
  showGrid?: boolean;
  showAxisValues?: boolean;
  scaleMin?: number;
  scaleMax?: number;
  kind: ChartKind;
  rows: { label: string; value: number }[];
  series?: { label: string; values: number[] }[];
  stacked?: boolean;
  stackPercent?: boolean;
  showLegend?: boolean;
  colours: string[];
  textColour: string;
  showLabels: boolean;
  showValues: boolean;
}
export interface TableData {
  title?: string;
  caption?: string;
  description?: string;
  fontFamily?: string;
  merges?: TableMerge[];
  cellStyles?: TableCellStyles;
  rows: string[][];
  header: boolean;
  headerColumn?: boolean;
  stripeAxis?: "row" | "column";
  headerColour: string;
  headerTextColour: string;
  cellColour: string;
  textColour: string;
  borderColour: string;
  stripeColour?: string | null;
  align?: "left" | "centre" | "right";
  borderWidth?: number;
  fitText?: boolean;
  fitColumns?: boolean;
  fitRows?: boolean;
  columnWidths?: number[];
  rowHeights?: number[];
  padding?: number;
  fontScale?: number;
  verticalAlign?: "top" | "middle" | "bottom";
  wrap?: boolean;
}
export interface DataVisualContext {
  save?(): void; restore?(): void; translate?(x: number, y: number): void; rotate?(angle: number): void;
  fillTextRotated?(text: string, x: number, y: number, degrees: number): void;
  direction?: string;
  lineCap?: string; lineJoin?: string;
  setLineDash?(segments: number[]): void;
  fillStyle: unknown; strokeStyle: unknown; font: string; textAlign: string; textBaseline: string; lineWidth: number;
  bezierCurveTo?(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise?: boolean): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  measureText(text: string): { width: number }; fillText(text: string, x: number, y: number): void;
}

/** Data is bounded before rendering so imported projects cannot create an unbounded draw loop. */
export function drawDataVisual(ctx: DataVisualContext, width: number, height: number, chart?: ChartData, table?: TableData, progress?: number): void {
  ctx.setLineDash?.([]);
  const graphic = table ?? chart, family = graphicFontCss(graphic?.fontFamily);
  let font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, graphic?.fontScale || 1));
  ctx.font = "500 " + font + "px " + family;
  ctx.textBaseline = "middle";
  function label(text: string, x: number, y: number, max: number) {
    let value = String(text).slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
    drawGraphicText(ctx,value, x, y);
  }
  if (graphic && (graphic.title?.trim() || graphic.caption?.trim())) {
    const outerHeight = height, band = Math.min(height * 0.22, font * 1.8);
    ctx.fillStyle = graphic.textColour; ctx.textAlign = "center";
    if (graphic.title?.trim()) { ctx.font = "700 " + Math.min(font * 1.1, band * 0.7) + "px " + family; label(graphic.title.trim(), 0, -outerHeight / 2 + band / 2, Math.max(1, width - font * 2)); }
    if (graphic.caption?.trim()) { ctx.font = "400 " + Math.min(font * 0.75, band * 0.6) + "px " + family; label(graphic.caption.trim(), 0, outerHeight / 2 - band / 2, Math.max(1, width - font * 2)); }
    height = Math.max(1, height - band * 2);
    font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, graphic.fontScale || 1));
    ctx.font = "500 " + font + "px " + family;
  }
  const left = -width / 2, top = -height / 2;
  if (table && Array.isArray(table.rows)) { drawEditableTable(ctx, width, height, table); return; }
  if (!chart || !Array.isArray(chart.rows)) return;
  chart = filterChartData(chart);
  if (chart.kind === "histogram") chart = histogramChartData(chart);
  const rows = chart.rows.slice(0, 50).filter(row => row && typeof row.label === "string" && Number.isFinite(row.value));
  if (!rows.length) return;
  const intervals = Math.max(1, Math.min(20, Math.round(chart.scaleIntervals ?? 4)));
  if (isProgressChart(chart.kind)) { drawProgressChart(ctx, width, height, chart); return; }
  if (chart.kind === "race") { drawChartRace(ctx, width, height, chart, progress); return; }
  if (chart.kind === "pictogram") { drawPictogramChart(ctx, width, height, chart); return; }
  if (chart.kind === "packed-circles") { drawPackedCirclesChart(ctx, width, height, chart); return; }
  if (chart.kind === "treemap") { drawTreemapChart(ctx, width, height, chart); return; }
  if (chart.kind === "funnel") { drawFunnelChart(ctx, width, height, chart, font); return; }
  if (drawMultiSeriesChart(ctx, width, height, chart)) return;
  const colours = Array.isArray(chart.colours) && chart.colours.length ? chart.colours.slice(0, 50) : ["#38bdf8"];
  const colour = (index: number) => colours[index % colours.length];
  const reference = chart.kind === "radar" || chart.kind === "pie" || chart.kind === "donut" ? 0 : chart.referenceLine?.value ?? 0;
  const max = Math.max(0, reference, ...rows.map(row => row.value), Number.isFinite(chart.scaleMax) ? Number(chart.scaleMax) : 0);
  const min = Math.min(0, reference, ...rows.map(row => row.value), Number.isFinite(chart.scaleMin) ? Number(chart.scaleMin) : 0);
  const span = max - min || 1;
  if (chart.kind === "pie" || chart.kind === "donut") {
    const positive = rows.map((row, colourIndex) => ({ ...row, colourIndex })).filter(row => row.value > 0), sum = positive.reduce((n, row) => n + row.value, 0);
    const portions = positive.map(row => {
      const share = chartValueLabel(row.value / sum * 100, { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 1, compact: false, locale: chart.valueFormat?.locale }), actual = chartValueLabel(row.value, chart.valueFormat);
      return chart.pieValueMode === "both" ? actual + " (" + share + ")" : chart.pieValueMode === "percent" ? share : chart.pieValueMode === "value" ? actual : chart.valueFormat ? actual : Number((row.value / sum * 100).toFixed(1)) + "%";
    });
    const entries = (chart.showLabels || chart.showValues) && chart.showLegend !== false ? positive.map((row, index) => ({ colour: colour(row.colourIndex), label: [chart.showLabels ? row.label : "", chart.showValues ? portions[index] : ""].filter(Boolean).join("  ") })) : [];
    const plot = drawChartLegend(ctx, width, height, entries, chart.legendPosition ?? "right", font, chart.textColour, family);
    const radius = Math.max(1, Math.min(plot.width * 0.45, plot.height * 0.45));
    const cx = plot.left + plot.width / 2, cy = plot.top + plot.height / 2;
    let start = -Math.PI / 2 + (chart.pieRotation ?? 0) * Math.PI / 180;
    positive.forEach((row, index) => {
      const end = start + row.value / sum * Math.PI * 2, gap = Math.min((chart.pieGap ?? 0) * Math.PI / 180, (end - start) * 0.8), from = start + gap / 2, to = end - gap / 2;
      ctx.fillStyle = colour(row.colourIndex); ctx.beginPath();
      if (chart.kind === "donut") {
        ctx.arc(cx, cy, radius, from, to); ctx.arc(cx, cy, radius * Math.max(0.2, Math.min(0.85, chart.donutHole ?? 0.57)), to, from, true);
      } else { ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, from, to); }
      ctx.closePath(); ctx.fill();
      start = end;
    });
    if (chart.kind === "donut") {
      const caption = typeof chart.donutLabel === "string" ? chart.donutLabel.replace(/\s+/g, " ").trim().slice(0, 80) : "", total = chart.donutTotal ? chartValueLabel(sum, chart.valueFormat) : "";
      const labels = [total, caption].filter(Boolean), hole = radius * Math.max(0.2, Math.min(0.85, chart.donutHole ?? 0.57));
      if (labels.length) {
        let size = Math.max(1, Math.min(font * 1.8, hole * (labels.length > 1 ? 0.45 : 0.7)));
        while (size > 1) { ctx.font = "700 " + size + "px " + family; if (labels.every(value => ctx.measureText(value).width <= hole * 1.65)) break; size = Math.max(1, size - 1); }
        ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        labels.forEach((value, index) => { ctx.font = (total && index === 0 ? "700 " : "500 ") + (total && index > 0 ? size * 0.75 : size) + "px " + family; drawGraphicText(ctx,value, cx, cy + (index - (labels.length - 1) / 2) * size * 1.25); });
      }
    }
    return;
  }
  if (chart.kind === "radar") {
    const radius = Math.max(1, Math.min(width, height) * (chart.showLabels ? 0.32 : 0.44));
    const ceiling = span;
    const point = (index: number, value: number) => {
      const angle = index / rows.length * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(angle) * radius * value, y: Math.sin(angle) * radius * value };
    };
    ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 900);
    for (let ring = 1; chart.showGrid !== false && ring <= intervals; ring++) {
      ctx.beginPath();
      rows.forEach((row, index) => { const p = point(index, ring / intervals); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
      if (chart.showValues) { ctx.fillStyle = chart.textColour; ctx.textAlign = "left"; label(chartValueLabel(Number((min + span * ring / intervals).toFixed(2)), chart.valueFormat), font * 0.3, -radius * ring / intervals, radius); }
    }
    rows.forEach((row, index) => {
      const p = point(index, 1); if (chart.showGrid !== false) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      if (chart.showLabels || chart.showValues) {
        const q = point(index, 1.18); ctx.textAlign = Math.abs(q.x) < font ? "center" : q.x < 0 ? "right" : "left";
        ctx.fillStyle = chart.textColour;
        label((chart.showLabels ? row.label : "") + (chart.showValues ? (chart.showLabels ? " " : "") + chartValueLabel(row.value, chart.valueFormat) : ""), q.x, q.y, Math.max(font, (width - radius * 2) / 2));
      }
    });
    ctx.beginPath();
    rows.forEach((row, index) => { const p = point(index, (row.value - min) / ceiling); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fillStyle = colour(0) + Math.round((chart.areaOpacity ?? 0.267) * 255).toString(16).padStart(2, "0"); ctx.fill(); ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 300) * (chart.lineWidth ?? 1); strokeChartPattern(ctx, chart.linePattern);
    return;
  }
  const xTitle = (chart.xAxisTitle ?? "").replace(/\s+/g, " ").trim(), yTitle = (chart.yAxisTitle ?? "").replace(/\s+/g, " ").trim();
  ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
  if (xTitle) label(xTitle, 0, height / 2 - font * 0.6, width - font * 2);
  if (yTitle) { ctx.textAlign = "left"; label(yTitle, left + font, top + font * 0.6, width - font * 2); }
  const horizontal = chart.kind === "bar";
  const labelSpace = chart.showLabels ? (horizontal ? width * 0.25 : chartCategoryLabelSpace(chart, font, height)) : font;
  const x0 = left + (horizontal ? labelSpace : font * (chart.showAxisValues ? 4 : 2)), x1 = width / 2 - font;
  const y0 = top + font * (yTitle ? 3 : 1.5), y1 = height / 2 - (xTitle ? font * 1.6 : 0) - (horizontal ? chart.showAxisValues ? font * 2.5 : font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const zeroX = x0 + (0 - min) / span * plotWidth;
  const zeroY = y1 - (0 - min) / span * plotHeight;
  if (chart.showGrid) for (let tick = 0; tick <= intervals; tick++) {
    const x = x0 + plotWidth * tick / intervals, y = y1 - plotHeight * tick / intervals;
    ctx.strokeStyle = chart.textColour + "33"; ctx.lineWidth = Math.max(1, width / 900);
    ctx.beginPath(); ctx.moveTo(horizontal ? x : x0, horizontal ? y0 : y); ctx.lineTo(horizontal ? x : x1, horizontal ? y1 : y); ctx.stroke();
  }
  if (chart.showAxisValues) for (let tick = 0; tick <= intervals; tick++) {
    const value = min + span * tick / intervals, x = x0 + plotWidth * tick / intervals, y = y1 - plotHeight * tick / intervals;
    ctx.fillStyle = chart.textColour; ctx.textAlign = horizontal ? "center" : "right";
    label(chartValueLabel(Number(value.toPrecision(3)), chart.valueFormat), horizontal ? x : x0 - font / 2, horizontal ? y1 + font * 1.2 : y, horizontal ? plotWidth / intervals * 0.95 : font * 3.5);
  }
  ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 700);
  ctx.beginPath(); ctx.moveTo(horizontal ? zeroX : x0, y0); ctx.lineTo(horizontal ? zeroX : x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  if (chart.kind === "area") {
    ctx.fillStyle = colour(0) + Math.round((chart.areaOpacity ?? 0.267) * 255).toString(16).padStart(2, "0"); ctx.beginPath();
    ctx.moveTo(x0 + 0.5 / rows.length * plotWidth, zeroY);
    traceChartLine(ctx, rows.map((row, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: y1 - (row.value - min) / span * plotHeight })), chart.lineStyle, true);
    ctx.lineTo(x0 + (rows.length - 0.5) / rows.length * plotWidth, zeroY); ctx.closePath(); ctx.fill();
  }
  if (chart.kind === "line" || chart.kind === "area") {
    ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 250) * (chart.lineWidth ?? 1); ctx.beginPath();
    traceChartLine(ctx, rows.map((row, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: y1 - (row.value - min) / span * plotHeight })), chart.lineStyle);
    strokeChartPattern(ctx, chart.linePattern);
  }
  rows.forEach((row, index) => {
    ctx.fillStyle = colour(index);
    if (horizontal) {
      const slot = plotHeight / rows.length, y = y0 + slot * (index + 0.5), x = x0 + (row.value - min) / span * plotWidth;
      ctx.fillRect(Math.min(zeroX, x), y - slot * (1 - (chart.barGap ?? 0.34)) / 2, Math.abs(x - zeroX), slot * (1 - (chart.barGap ?? 0.34)));
      ctx.fillStyle = chart.textColour; ctx.textAlign = "right";
      if (chart.showLabels && showChartCategoryLabel(chart, index, rows.length)) { if (chart.labelWrap) drawChartCategoryLabel(ctx, row.label, x0 - font * 0.5, y, labelSpace - font, Math.min(font, slot * 0.4), 2, true); else label(row.label, x0 - font * 0.5, y, labelSpace - font); }
      if (chart.showValues) label(chartValueLabel(row.value, chart.valueFormat), x1, y - slot * 0.35, plotWidth);
    } else {
      const slot = plotWidth / rows.length, x = x0 + slot * (index + 0.5), y = y1 - (row.value - min) / span * plotHeight;
      if (chart.kind === "column") ctx.fillRect(x - slot * (1 - (chart.barGap ?? 0.34)) / 2, Math.min(zeroY, y), slot * (1 - (chart.barGap ?? 0.34)), Math.abs(y - zeroY));
      else {
        if (chart.kind === "lollipop") { ctx.strokeStyle = colour(index); ctx.lineWidth = Math.max(2, width / 250) * (chart.lineWidth ?? 1); ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, y); strokeChartPattern(ctx, chart.linePattern); }
        drawChartMarker(ctx, x, y, Math.max(2, width / 180) * (chart.pointSize ?? 1), chart.pointShape); }
      ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
      if (chart.showLabels && showChartCategoryLabel(chart, index, rows.length)) { if (chart.labelAngle) drawAngledCategoryLabel(ctx, row.label, x, y1 + font, Math.max(font, labelSpace - font * 2), x0, x1, font, chart.labelAngle); else if (chart.labelWrap) drawChartCategoryLabel(ctx, row.label, x, y1 + font, chartCategoryLabelWidth(chart, index, rows.length, slot), font, 3); else label(row.label, x, y1 + font * 1.2, chartCategoryLabelWidth(chart, index, rows.length, slot)); }
      if (chart.showValues) label(chartValueLabel(row.value, chart.valueFormat), x, Math.max(top + font * 0.5, y - font * 0.7), slot);
    }
  });
  drawChartReference(ctx, chart, x0, y0, x1, y1, min, max, font);
}

export function parseChartData(text: string): ChartData["rows"] {
  return parseDelimitedData(text, 50, 12).map(row => {
    if (row.length < 2) throw new Error("Use one label,value pair per line");
    const label = row.slice(0, -1).join(",").slice(0, 200), raw = row[row.length - 1];
    const value = Number(raw);
    if (!label || !raw || !Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error("Each chart row needs a label and a number");
    return { label, value };
  });
}

export function parseTableData(text: string): string[][] {
  return parseDelimitedData(text, 20, 12).map(row => row.map(cell => cell.slice(0, 200)));
}

export function validDataVisuals(value: { chart?: unknown; table?: unknown }): boolean {
  const object = (part: unknown): part is Record<string, unknown> => !!part && typeof part === "object" && !Array.isArray(part);
  const colour = (part: unknown) => typeof part === "string" && /^#[0-9a-f]{6}$/i.test(part);
  if (value.chart !== undefined) {
    const chart = value.chart;
    if (value.table !== undefined || !object(chart) || !CHART_KINDS.includes(chart.kind as ChartKind) ||
      !Array.isArray(chart.rows) || !chart.rows.length || chart.rows.length > 50 || !Array.isArray(chart.colours) ||
      !chart.colours.length || chart.colours.length > 50 || !chart.colours.every(colour) || !colour(chart.textColour) ||
      typeof chart.showLabels !== "boolean" || typeof chart.showValues !== "boolean" ||
      chart.rows.some(row => !object(row) || typeof row.label !== "string" || row.label.length > 200 || typeof row.value !== "number" || !Number.isFinite(row.value) || Math.abs(row.value) > 1e12)) return false;
    if ((chart.kind === "treemap" || chart.kind === "packed-circles") && treemapDataError(chart.rows as { label: string; value: number }[])) return false;
    if (chart.kind === "funnel" && (chart.rows.some(row => row.value < 0) || !chart.rows.some(row => row.value > 0))) return false;
    if ((chart.kind === "scatter" || chart.kind === "bubble") && chart.rows.some(row => !object(row) || typeof row.label !== "string" || !row.label.trim() || !Number.isFinite(chartXValue(row.label, String(chart.xAxisMode ?? "number"))))) return false;
    if (chart.series !== undefined && (!Array.isArray(chart.series) || !chart.series.length || chart.series.length > 6 || chart.series.some(series => !object(series) || typeof series.label !== "string" || !series.label || series.label.length > 200 || !Array.isArray(series.values) || series.values.length !== (chart.rows as unknown[]).length || series.values.some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12)))) return false;
    for (const key of ["scaleIntervals", "scaleXIntervals"] as const) if (chart[key] !== undefined && (typeof chart[key] !== "number" || !Number.isInteger(chart[key]) || chart[key] < 1 || chart[key] > 20)) return false;
    if (!validChartRowFilters(chart.filters)) return false;
    if (chart.areaMode !== undefined && !["overlay", "stacked", "percent", "stream"].includes(String(chart.areaMode))) return false;
    if (chart.kind === "area" && chart.areaMode !== undefined && chart.areaMode !== "overlay" && (chart.rows.some(row => row.value < 0) || Array.isArray(chart.series) && (chart.series as { values: number[] }[]).some(series => series.values.some(value => value < 0)))) return false;
    if (chart.kind === "bubble" && Array.isArray(chart.series)) { const size = (chart.series as { values: number[] }[])[Number(chart.bubbleSizeSeries ?? 1)]; if (size && (size.values.some(value => value < 0) || !size.values.some(value => value > 0))) return false; }
    if (chart.referenceLine !== undefined && (!object(chart.referenceLine) || typeof chart.referenceLine.value !== "number" || !Number.isFinite(chart.referenceLine.value) || Math.abs(chart.referenceLine.value) > 1e12 || !colour(chart.referenceLine.colour) || chart.referenceLine.label !== undefined && (typeof chart.referenceLine.label !== "string" || chart.referenceLine.label.length > 80))) return false;
    if ((chart.stackPercent && chart.stacked && (chart.kind === "bar" || chart.kind === "column") || chart.kind === "area" && chart.areaMode === "percent") && object(chart.referenceLine) && Math.abs(Number(chart.referenceLine.value)) > 100) return false;
    if (chart.kind === "pictogram" && chart.pictogramMode !== "progress" && (chart.rows.some(row => row.value < 0) || !chart.rows.some(row => row.value > 0))) return false;
    if (chart.kind === "race" && (!Array.isArray(chart.series) || chart.series.length < 2 || (chart.series as { values: number[] }[]).some(frame => frame.values.some(value => value < 0)) || !(chart.series as { values: number[] }[]).some(frame => frame.values.some(value => value > 0)))) return false;
    if (isProgressChart(String(chart.kind)) && (chart.rows[0].value < 0 || chart.rows[0].value > 100)) return false;
    for (const [key, minimum] of [["bubbleYSeries", 0], ["bubbleSizeSeries", -1]] as const) if (chart[key] !== undefined && (typeof chart[key] !== "number" || !Number.isInteger(chart[key]) || chart[key] < minimum || chart[key] > 5)) return false;
    if (chart.kind === "bubble" && Array.isArray(chart.series) && [chart.bubbleYSeries, chart.bubbleSizeSeries].some(index => typeof index === "number" && index >= (chart.series as unknown[]).length)) return false;
    if (chart.progressThickness !== undefined && (typeof chart.progressThickness !== "number" || !Number.isFinite(chart.progressThickness) || chart.progressThickness < 0.04 || chart.progressThickness > 0.5)) return false;
    if (chart.progressRounded !== undefined && typeof chart.progressRounded !== "boolean") return false;
    if (chart.raceTop !== undefined && (typeof chart.raceTop !== "number" || !Number.isInteger(chart.raceTop) || chart.raceTop < 1 || chart.raceTop > 20)) return false;
    if (chart.racePoster !== undefined && (typeof chart.racePoster !== "number" || !Number.isFinite(chart.racePoster) || chart.racePoster < 0 || chart.racePoster > 1)) return false;
    if (chart.raceAnimate !== undefined && typeof chart.raceAnimate !== "boolean") return false;
    if (!validPictogramSymbol(chart.pictogramSymbol)) return false;
    if (chart.pictogramMode !== undefined && !["shares", "progress"].includes(String(chart.pictogramMode))) return false;
    if (chart.kind === "pictogram" && chart.pictogramMode === "progress" && (!Number.isInteger(chart.rows[0].value) || chart.rows[0].value < 0 || chart.rows[0].value > Number(chart.pictogramCount ?? 100))) return false;
    if (chart.pictogramCount !== undefined && (typeof chart.pictogramCount !== "number" || !Number.isInteger(chart.pictogramCount) || chart.pictogramCount < 10 || chart.pictogramCount > 100)) return false;
    if (chart.pictogramColumns !== undefined && (typeof chart.pictogramColumns !== "number" || !Number.isInteger(chart.pictogramColumns) || chart.pictogramColumns < 2 || chart.pictogramColumns > 20)) return false;
    if (chart.pictogramShape !== undefined && !["circle", "square", "diamond", "star", "person", "symbol"].includes(String(chart.pictogramShape))) return false;
    if (chart.histogramBins !== undefined && (typeof chart.histogramBins !== "number" || !Number.isInteger(chart.histogramBins) || chart.histogramBins < 1 || chart.histogramBins > 20)) return false;
    for (const [key, limit] of [["title", 100], ["caption", 200], ["description", 1000]] as const) if (chart[key] !== undefined && (typeof chart[key] !== "string" || chart[key].length > limit || /[\u0000-\u001f\u007f]/.test(chart[key]))) return false;
    if (!validGraphicFont(chart.fontFamily)) return false;
    if (!validChartValueFormat(chart.xValueFormat)) return false;
    if (chart.labelEvery !== undefined && (typeof chart.labelEvery !== "number" || !Number.isInteger(chart.labelEvery) || chart.labelEvery < 1 || chart.labelEvery > 10)) return false;
    if (chart.labelAngle !== undefined && (typeof chart.labelAngle !== "number" || !Number.isFinite(chart.labelAngle) || chart.labelAngle < -90 || chart.labelAngle > 90)) return false;
    if (chart.labelWrap !== undefined && typeof chart.labelWrap !== "boolean") return false;
    if (chart.pointLabelMode !== undefined && !["value", "coordinates"].includes(String(chart.pointLabelMode))) return false;
    if (!validChartValueFormat(chart.valueFormat)) return false;
    for (const key of ["xAxisTitle", "yAxisTitle"] as const) if (chart[key] !== undefined && (typeof chart[key] !== "string" || chart[key].length > 100)) return false;
    if (chart.donutLabel !== undefined && (typeof chart.donutLabel !== "string" || chart.donutLabel.length > 80)) return false;
    if (chart.donutTotal !== undefined && typeof chart.donutTotal !== "boolean") return false;
    if (chart.pieValueMode !== undefined && !["auto", "percent", "value", "both"].includes(String(chart.pieValueMode))) return false;
    if (chart.donutHole !== undefined && (typeof chart.donutHole !== "number" || !Number.isFinite(chart.donutHole) || chart.donutHole < 0.2 || chart.donutHole > 0.85)) return false;
    for (const [key, minimum, maximum] of [["fontScale", 0.5, 3], ["pieRotation", 0, 360], ["pieGap", 0, 20], ["lineWidth", 0.25, 5], ["pointSize", 0, 4], ["areaOpacity", 0, 1], ["barGap", 0, 0.9]] as const) {
      const value = chart[key]; if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)) return false;
    }
    if (chart.scatterLines !== undefined && typeof chart.scatterLines !== "boolean") return false;
    if (chart.xAxisMode !== undefined && !["number", "date"].includes(String(chart.xAxisMode))) return false;
    if (chart.xDateFormat !== undefined && !["short", "month", "year", "time", "datetime"].includes(String(chart.xDateFormat))) return false;
    if (chart.xDateLocale !== undefined && !(CHART_NUMBER_LOCALES as readonly string[]).includes(String(chart.xDateLocale))) return false;
    if (chart.pointShape !== undefined && !["circle", "square", "diamond", "triangle", "cross"].includes(String(chart.pointShape))) return false;
    if (chart.linePattern !== undefined && !["solid", "dashed", "dotted", "dash-dot"].includes(String(chart.linePattern))) return false;
    if (chart.seriesPatterns !== undefined && typeof chart.seriesPatterns !== "boolean") return false;
    if (chart.lineStyle !== undefined && !["straight", "step", "smooth"].includes(String(chart.lineStyle))) return false;
    if (chart.legendPosition !== undefined && !["top", "bottom", "left", "right"].includes(String(chart.legendPosition))) return false;
    for (const key of ["scaleMin", "scaleMax", "scaleXMin", "scaleXMax"] as const) { const value = chart[key]; if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || (chart.xAxisMode === "date" && (key === "scaleXMin" || key === "scaleXMax") ? value < CHART_DATE_MIN || value > CHART_DATE_MAX : Math.abs(value) > 1e12))) return false; }
    if (typeof chart.scaleMin === "number" && typeof chart.scaleMax === "number" && chart.scaleMin >= chart.scaleMax) return false;
    if (typeof chart.scaleXMin === "number" && typeof chart.scaleXMax === "number" && chart.scaleXMin >= chart.scaleXMax) return false;
    if (chart.showAxisValues !== undefined && typeof chart.showAxisValues !== "boolean") return false;
    if (chart.showGrid !== undefined && typeof chart.showGrid !== "boolean") return false;
    if (chart.stackPercent !== undefined && typeof chart.stackPercent !== "boolean") return false;
    if (chart.stacked !== undefined && typeof chart.stacked !== "boolean") return false;
    if (chart.showLegend !== undefined && typeof chart.showLegend !== "boolean") return false;
  }
  if (value.table !== undefined) {
    const table = value.table;
    if (!object(table) || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 20 ||
      table.rows.some(row => !Array.isArray(row) || !row.length || row.length > 12 || row.some(cell => typeof cell !== "string" || cell.length > 200)) ||
      typeof table.header !== "boolean" || ![table.headerColour, table.headerTextColour, table.cellColour, table.textColour, table.borderColour].every(colour)) return false;
    for (const [key, limit] of [["title", 100], ["caption", 200], ["description", 1000]] as const) if (table[key] !== undefined && (typeof table[key] !== "string" || table[key].length > limit || /[\u0000-\u001f\u007f]/.test(table[key]))) return false;
    if (table.fitText !== undefined && typeof table.fitText !== "boolean") return false;
    if (!validGraphicFont(table.fontFamily)) return false;
    if (table.fitRows !== undefined && typeof table.fitRows !== "boolean") return false;
    if (table.fitColumns !== undefined && typeof table.fitColumns !== "boolean") return false;
    if (table.headerColumn !== undefined && typeof table.headerColumn !== "boolean") return false;
    if (table.stripeAxis !== undefined && !["row", "column"].includes(String(table.stripeAxis))) return false;
    if (table.stripeColour !== undefined && table.stripeColour !== null && !colour(table.stripeColour)) return false;
    if (table.align !== undefined && !["left", "centre", "right"].includes(String(table.align))) return false;
    if (table.borderWidth !== undefined && (typeof table.borderWidth !== "number" || !Number.isFinite(table.borderWidth) || table.borderWidth < 0 || table.borderWidth > 8)) return false;
    if (!validTableCellStyles(table.cellStyles)) return false;
    if (!validTableMerges(table.merges, table.rows.length, Math.max(0, ...table.rows.map((row: unknown) => Array.isArray(row) ? row.length : 0)))) return false;
    for (const key of ["columnWidths", "rowHeights"] as const) { const weights = table[key]; if (weights !== undefined && (!Array.isArray(weights) || weights.length > (key === "columnWidths" ? 12 : 20) || weights.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0.1 || value > 10))) return false; }
    if (table.padding !== undefined && (typeof table.padding !== "number" || !Number.isFinite(table.padding) || table.padding < 0 || table.padding > 80)) return false;
    if (table.fontScale !== undefined && (typeof table.fontScale !== "number" || !Number.isFinite(table.fontScale) || table.fontScale < 0.5 || table.fontScale > 3)) return false;
    if (table.verticalAlign !== undefined && !["top", "middle", "bottom"].includes(String(table.verticalAlign))) return false;
    if (table.wrap !== undefined && typeof table.wrap !== "boolean") return false;
  }
  return true;
}
