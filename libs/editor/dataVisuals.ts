import { parseDelimitedData } from "./delimitedData";
import { drawMultiSeriesChart } from "./multiSeriesCharts";
export const CHART_KINDS = ["column", "bar", "line", "area", "lollipop", "pie", "donut", "radar"] as const;
export type ChartKind = typeof CHART_KINDS[number];
export interface ChartData {
  kind: ChartKind;
  rows: { label: string; value: number }[];
  series?: { label: string; values: number[] }[];
  stacked?: boolean;
  showLegend?: boolean;
  colours: string[];
  textColour: string;
  showLabels: boolean;
  showValues: boolean;
}
export interface TableData {
  rows: string[][];
  header: boolean;
  headerColour: string;
  headerTextColour: string;
  cellColour: string;
  textColour: string;
  borderColour: string;
  stripeColour?: string | null;
  align?: "left" | "centre" | "right";
  borderWidth?: number;
}
export interface DataVisualContext {
  fillStyle: unknown; strokeStyle: unknown; font: string; textAlign: string; textBaseline: string; lineWidth: number;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise?: boolean): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  measureText(text: string): { width: number }; fillText(text: string, x: number, y: number): void;
}

/** Data is bounded before rendering so imported projects cannot create an unbounded draw loop. */
export function drawDataVisual(ctx: DataVisualContext, width: number, height: number, chart?: ChartData, table?: TableData): void {
  const left = -width / 2, top = -height / 2;
  const font = Math.max(8, Math.min(24, height / 18, width / 28));
  ctx.font = "500 " + font + "px Inter, sans-serif";
  ctx.textBaseline = "middle";
  function label(text: string, x: number, y: number, max: number) {
    let value = String(text).slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
    ctx.fillText(value, x, y);
  }
  if (table && Array.isArray(table.rows)) {
    const rows = table.rows.filter(Array.isArray).slice(0, 20);
    const columns = Math.min(12, Math.max(1, ...rows.map(row => row.length)));
    const cellWidth = width / columns, cellHeight = height / Math.max(1, rows.length);
    ctx.lineWidth = Math.max(1, width / 700) * (table.borderWidth ?? 1);
    rows.forEach((row, r) => {
      for (let c = 0; c < columns; c++) {
        const x = left + c * cellWidth, y = top + r * cellHeight;
        ctx.fillStyle = table.header && r === 0 ? table.headerColour : table.stripeColour && r % 2 === (table.header ? 0 : 1) ? table.stripeColour : table.cellColour;
        ctx.fillRect(x, y, cellWidth, cellHeight);
        ctx.strokeStyle = table.borderColour;
        if ((table.borderWidth ?? 1) > 0) ctx.strokeRect(x, y, cellWidth, cellHeight);
        ctx.fillStyle = table.header && r === 0 ? table.headerTextColour : table.textColour;
        ctx.textAlign = table.align === "centre" ? "center" : table.align ?? "left";
        ctx.font = (table.header && r === 0 ? "700 " : "500 ") + font + "px Inter, sans-serif";
        const anchor = table.align === "centre" ? x + cellWidth / 2 : table.align === "right" ? x + cellWidth - font * 0.5 : x + font * 0.5;
        label(row[c] || "", anchor, y + cellHeight / 2, Math.max(1, cellWidth - font));
      }
    });
    return;
  }
  if (!chart || !Array.isArray(chart.rows)) return;
  const rows = chart.rows.slice(0, 50).filter(row => row && typeof row.label === "string" && Number.isFinite(row.value));
  if (!rows.length) return;
  if (drawMultiSeriesChart(ctx, width, height, chart)) return;
  const colours = Array.isArray(chart.colours) && chart.colours.length ? chart.colours.slice(0, 50) : ["#38bdf8"];
  const colour = (index: number) => colours[index % colours.length];
  const max = Math.max(0, ...rows.map(row => row.value));
  const min = Math.min(0, ...rows.map(row => row.value));
  const span = max - min || 1;
  if (chart.kind === "pie" || chart.kind === "donut") {
    const positive = rows.filter(row => row.value > 0), sum = positive.reduce((n, row) => n + row.value, 0);
    const legend = chart.showLabels ? Math.min(width * 0.42, 220) : 0;
    const radius = Math.max(1, Math.min((width - legend) * 0.45, height * 0.45));
    const cx = left + (width - legend) / 2;
    let start = -Math.PI / 2;
    positive.forEach((row, index) => {
      const end = start + row.value / sum * Math.PI * 2;
      ctx.fillStyle = colour(index); ctx.beginPath();
      if (chart.kind === "donut") {
        ctx.arc(cx, 0, radius, start, end); ctx.arc(cx, 0, radius * 0.57, end, start, true);
      } else { ctx.moveTo(cx, 0); ctx.arc(cx, 0, radius, start, end); }
      ctx.closePath(); ctx.fill();
      if (chart.showLabels && index < Math.floor(height / (font * 1.7))) {
        const x = left + width - legend + font, y = top + font * (1.3 + index * 1.7);
        ctx.fillStyle = colour(index); ctx.fillRect(x, y - font * 0.35, font * 0.7, font * 0.7);
        ctx.fillStyle = chart.textColour; ctx.textAlign = "left";
        label(row.label + (chart.showValues ? "  " + Number((row.value / sum * 100).toFixed(1)) + "%" : ""), x + font, y, legend - font * 2);
      }
      start = end;
    });
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
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      rows.forEach((row, index) => { const p = point(index, ring / 4); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
      if (chart.showValues) { ctx.fillStyle = chart.textColour; ctx.textAlign = "left"; label(String(Number((min + span * ring / 4).toFixed(2))), font * 0.3, -radius * ring / 4, radius); }
    }
    rows.forEach((row, index) => {
      const p = point(index, 1); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.x, p.y); ctx.stroke();
      if (chart.showLabels || chart.showValues) {
        const q = point(index, 1.18); ctx.textAlign = Math.abs(q.x) < font ? "center" : q.x < 0 ? "right" : "left";
        ctx.fillStyle = chart.textColour;
        label((chart.showLabels ? row.label : "") + (chart.showValues ? (chart.showLabels ? " " : "") + row.value : ""), q.x, q.y, Math.max(font, (width - radius * 2) / 2));
      }
    });
    ctx.beginPath();
    rows.forEach((row, index) => { const p = point(index, (row.value - min) / ceiling); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fillStyle = colour(0) + "44"; ctx.fill(); ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 300); ctx.stroke();
    return;
  }
  const horizontal = chart.kind === "bar";
  const labelSpace = chart.showLabels ? (horizontal ? width * 0.25 : font * 2.5) : font;
  const x0 = left + (horizontal ? labelSpace : font * 2), x1 = width / 2 - font;
  const y0 = top + font * 1.5, y1 = height / 2 - (horizontal ? font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const zeroX = x0 + (0 - min) / span * plotWidth;
  const zeroY = y1 - (0 - min) / span * plotHeight;
  ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 700);
  ctx.beginPath(); ctx.moveTo(horizontal ? zeroX : x0, y0); ctx.lineTo(horizontal ? zeroX : x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  if (chart.kind === "area") {
    ctx.fillStyle = colour(0) + "44"; ctx.beginPath();
    ctx.moveTo(x0 + 0.5 / rows.length * plotWidth, zeroY);
    rows.forEach((row, index) => ctx.lineTo(x0 + (index + 0.5) / rows.length * plotWidth, y1 - (row.value - min) / span * plotHeight));
    ctx.lineTo(x0 + (rows.length - 0.5) / rows.length * plotWidth, zeroY); ctx.closePath(); ctx.fill();
  }
  if (chart.kind === "line" || chart.kind === "area") {
    ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 250); ctx.beginPath();
    rows.forEach((row, index) => {
      const x = x0 + (index + 0.5) / rows.length * plotWidth, y = y1 - (row.value - min) / span * plotHeight;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  rows.forEach((row, index) => {
    ctx.fillStyle = colour(index);
    if (horizontal) {
      const slot = plotHeight / rows.length, y = y0 + slot * (index + 0.5), x = x0 + (row.value - min) / span * plotWidth;
      ctx.fillRect(Math.min(zeroX, x), y - slot * 0.33, Math.abs(x - zeroX), slot * 0.66);
      ctx.fillStyle = chart.textColour; ctx.textAlign = "right";
      if (chart.showLabels) label(row.label, x0 - font * 0.5, y, labelSpace - font);
      if (chart.showValues) label(String(row.value), x1, y - slot * 0.35, plotWidth);
    } else {
      const slot = plotWidth / rows.length, x = x0 + slot * (index + 0.5), y = y1 - (row.value - min) / span * plotHeight;
      if (chart.kind === "column") ctx.fillRect(x - slot * 0.33, Math.min(zeroY, y), slot * 0.66, Math.abs(y - zeroY));
      else {
        if (chart.kind === "lollipop") { ctx.strokeStyle = colour(index); ctx.lineWidth = Math.max(2, width / 250); ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, width / 180), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
      if (chart.showLabels) label(row.label, x, y1 + font * 1.2, slot * 0.95);
      if (chart.showValues) label(String(row.value), x, Math.max(top + font * 0.5, y - font * 0.7), slot);
    }
  });
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
    if (chart.series !== undefined && (!Array.isArray(chart.series) || !chart.series.length || chart.series.length > 6 || chart.series.some(series => !object(series) || typeof series.label !== "string" || !series.label || series.label.length > 200 || !Array.isArray(series.values) || series.values.length !== (chart.rows as unknown[]).length || series.values.some(value => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12)))) return false;
    if (chart.stacked !== undefined && typeof chart.stacked !== "boolean") return false;
    if (chart.showLegend !== undefined && typeof chart.showLegend !== "boolean") return false;
  }
  if (value.table !== undefined) {
    const table = value.table;
    if (!object(table) || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 20 ||
      table.rows.some(row => !Array.isArray(row) || !row.length || row.length > 12 || row.some(cell => typeof cell !== "string" || cell.length > 200)) ||
      typeof table.header !== "boolean" || ![table.headerColour, table.headerTextColour, table.cellColour, table.textColour, table.borderColour].every(colour)) return false;
    if (table.stripeColour !== undefined && table.stripeColour !== null && !colour(table.stripeColour)) return false;
    if (table.align !== undefined && !["left", "centre", "right"].includes(String(table.align))) return false;
    if (table.borderWidth !== undefined && (typeof table.borderWidth !== "number" || !Number.isFinite(table.borderWidth) || table.borderWidth < 0 || table.borderWidth > 8)) return false;
  }
  return true;
}
