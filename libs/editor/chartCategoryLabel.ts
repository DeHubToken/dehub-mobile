import { drawGraphicText } from "./graphicText";
import { tableTextLines } from "./tableTextLayout";
import type { DataVisualContext } from "./dataVisuals";
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
