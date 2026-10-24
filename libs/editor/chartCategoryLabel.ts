import { drawGraphicText } from "./graphicText";
import { tableTextLines } from "./tableTextLayout";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export function showChartCategoryLabel(chart: ChartData, index: number, count: number): boolean {
  return index === 0 || index === count - 1 || index % Math.max(1, Math.min(10, Math.round(chart.labelEvery ?? 1))) === 0;
}
export function chartCategoryLabelSpace(chart: ChartData, font: number, height: number): number {
  return chart.labelAngle ? Math.min(height * 0.32, font * 8) + font : font * (chart.labelWrap ? 4.5 : 2.5);
}
export function chartCategoryLabelWidth(chart: ChartData, index: number, count: number, slot: number): number {
  const every = Math.max(1, Math.min(10, Math.round(chart.labelEvery ?? 1)));
  const previous = Math.max(0, Math.floor((index - 1) / every) * every), next = Math.min(count - 1, (Math.floor(index / every) + 1) * every);
  return slot * 0.95 * Math.max(1, Math.min(every, index === 0 ? 1 : index - previous, index === count - 1 ? 1 : next - index));
}
export function drawAngledCategoryLabel(ctx: DataVisualContext, text: string, x: number, y: number, depth: number, left: number, right: number, font: number, degrees: number): void {
  const angle = Math.max(-90, Math.min(90, degrees)), radians = angle * Math.PI / 180;
  const across = Math.max(0, angle > 0 ? right - x : x - left), sine = Math.abs(Math.sin(radians)), cosine = Math.abs(Math.cos(radians));
  const width = Math.min(depth / Math.max(0.01, sine), cosine < 0.05 ? depth : Math.max(0, across - font / 2) / cosine);
  if (width < font || font < 4) return;
  const previous = ctx.font, align = ctx.textAlign, baseline = ctx.textBaseline;
  ctx.font = previous.replace(/[\d.]+px/, font + "px"); ctx.textAlign = angle > 0 ? "left" : "right"; ctx.textBaseline = "middle";
  let value = text;
  while (Array.from(value).length > 1 && ctx.measureText(value).width > width) value = Array.from(value).slice(0, -2).join("") + "…";
  if (ctx.measureText(value).width <= width) {
    if (ctx.fillTextRotated) ctx.fillTextRotated(value, x, y, angle);
    else if (ctx.save && ctx.restore && ctx.translate && ctx.rotate) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(radians); drawGraphicText(ctx, value, 0, 0); ctx.restore();
    } else drawGraphicText(ctx, value, x, y);
  }
  ctx.font = previous; ctx.textAlign = align; ctx.textBaseline = baseline;
}
export function drawChartCategoryLabel(ctx: DataVisualContext, text: string, x: number, y: number, width: number, font: number, lineLimit: number, centred = false): void {
  if (width < font * 0.6 || font < 4) return;
  const previous = ctx.font, baseline = ctx.textBaseline;
  ctx.font = previous.replace(/[\d.]+px/, font + "px"); ctx.textBaseline = "middle";
  const wrapped = tableTextLines(text, width, text => ctx.measureText(text).width, true), limit = Math.max(1, Math.min(3, Math.floor(lineLimit))), lines = wrapped.slice(0, limit);
  if (wrapped.length > limit && lines.length) lines[lines.length - 1] += "…";
  const gap = font * 1.2, top = centred ? y - (lines.length - 1) * gap / 2 : y;
  lines.forEach((line, index) => {
    let value = line;
    while (Array.from(value).length > 1 && ctx.measureText(value).width > width) value = Array.from(value).slice(0, -2).join("") + "…";
    if (ctx.measureText(value).width <= width) drawGraphicText(ctx,value, x, top + index * gap);
  });
  ctx.font = previous; ctx.textBaseline = baseline;
}
