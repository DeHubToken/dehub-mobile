import { drawGraphicText } from "./graphicText";
import { chartValueLabel } from "./chartValueFormat";
import { graphicFontCss } from "./graphicFonts";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export const PROGRESS_CHART_KINDS = ["progress-bar", "progress-ring", "radial-progress", "progress-dial"] as const;
export function isProgressChart(kind: string): boolean { return (PROGRESS_CHART_KINDS as readonly string[]).includes(kind); }
export function drawProgressChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData): void {
  const row = chart.rows[0];
  if (!row || !Number.isFinite(row.value)) return;
  const fraction = Math.max(0, Math.min(100, row.value)) / 100, fill = chart.colours[0] || "#38bdf8", track = chart.colours[1] || "#334155", rounded = chart.progressRounded !== false;
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1)), family = graphicFontCss(chart.fontFamily);
  const percentage = chartValueLabel(fraction * 100, { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 0, compact: false, locale: chart.valueFormat?.locale, prefix: chart.valueFormat?.prefix, suffix: chart.valueFormat?.suffix });
  const text = (value: string, x: number, y: number, available: number, size: number, weight = 500) => {
    if (available < size) return;
    ctx.font = weight + " " + size + "px " + family; ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let label = value.slice(0, 200);
    while (label.length > 1 && ctx.measureText(label).width > available) label = label.slice(0, -2) + "…";
    if (ctx.measureText(label).width <= available) drawGraphicText(ctx,label, x, y);
  };
  const bar = (x: number, y: number, w: number, h: number) => {
    if (w <= 0 || h <= 0) return;
    const r = rounded ? Math.min(w, h) / 2 : 0;
    if (!r) { ctx.fillRect(x, y, w, h); return; }
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0); ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2); ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI); ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); ctx.closePath(); ctx.fill();
  };
  if (chart.kind === "progress-bar") {
    const thickness = Math.max(0.04, Math.min(0.5, chart.progressThickness ?? 0.22)), w = Math.max(1, width - font * 2), h = Math.max(1, (height - font * 4) * thickness), y = -h / 2;
    ctx.fillStyle = track; bar(-w / 2, y, w, h); ctx.fillStyle = fill; bar(-w / 2, y, w * fraction, h);
    if (chart.showValues) text(percentage, 0, y - font * 1.2, width - font * 2, Math.min(font * 1.6, height * 0.2), 700);
    if (chart.showLabels) text(row.label, 0, y + h + font * 1.2, width - font * 2, Math.min(font, height * 0.15));
    return;
  }
  const dial = chart.kind === "progress-dial", radius = Math.max(1, dial ? Math.min(width * 0.43, height * 0.68) : Math.min(width, height) * 0.43), cy = dial ? height * 0.2 : 0;
  const ratio = Math.max(0.04, Math.min(0.5, chart.progressThickness ?? (chart.kind === "progress-ring" ? 0.06 : chart.kind === "radial-progress" ? 0.24 : 0.12))), thickness = radius * ratio;
  const start = dial ? Math.PI : -Math.PI / 2, sweep = dial ? Math.PI : Math.PI * 2;
  const arc = (amount: number, colour: string, caps: boolean) => {
    if (amount <= 0) return;
    const end = start + sweep * amount, inner = radius - thickness;
    ctx.fillStyle = colour; ctx.beginPath(); ctx.arc(0, cy, radius, start, end); ctx.arc(0, cy, inner, end, start, true); ctx.closePath(); ctx.fill();
    if (caps && (dial || amount < 1)) for (const angle of [start, end]) { const middle = radius - thickness / 2; ctx.beginPath(); ctx.arc(Math.cos(angle) * middle, cy + Math.sin(angle) * middle, thickness / 2, 0, Math.PI * 2); ctx.fill(); }
  };
  arc(1, track, rounded); arc(fraction, fill, rounded);
  const centreY = dial ? cy - radius * 0.25 : 0, available = (radius - thickness) * 1.6;
  if (chart.showValues) text(percentage, 0, centreY - (chart.showLabels ? font * 0.4 : 0), available, Math.min(font * 2.2, radius * 0.42), 700);
  if (chart.showLabels) text(row.label, 0, centreY + (chart.showValues ? font * 1.3 : 0), available, Math.min(font, radius * 0.18));
}
