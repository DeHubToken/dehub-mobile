import type { DataVisualContext } from "./dataVisuals";
export type ChartLegendPosition = "top" | "bottom" | "left" | "right";
export interface ChartLegendEntry { label: string; colour: string }
export function drawChartLegend(ctx: DataVisualContext, width: number, height: number, input: readonly ChartLegendEntry[], position: ChartLegendPosition, font: number, textColour: string, fontFamily = "Inter, sans-serif") {
  const entries = input.slice(0, 50), bounds = { left: -width / 2, top: -height / 2, width, height };
  if (!entries.length) return bounds;
  const horizontal = position === "top" || position === "bottom", rowHeight = font * 1.8, padding = font * 0.5;
  const columns = horizontal ? Math.max(1, Math.min(entries.length, Math.floor(width / (font * 12)))) : 1;
  const wantedRows = Math.ceil(entries.length / columns), reserve = horizontal ? Math.min(height * 0.4, wantedRows * rowHeight + padding * 2) : Math.min(width * 0.4, font * 16);
  const legend = { left: bounds.left, top: bounds.top, width: horizontal ? width : reserve, height: horizontal ? reserve : height };
  if (position === "right") { legend.left = width / 2 - reserve; bounds.width -= reserve; }
  else if (position === "left") { bounds.left += reserve; bounds.width -= reserve; }
  else if (position === "bottom") { legend.top = height / 2 - reserve; bounds.height -= reserve; }
  else { bounds.top += reserve; bounds.height -= reserve; }
  const rows = Math.max(0, Math.floor((legend.height - padding * 2) / rowHeight)), capacity = rows * columns;
  if (!capacity) return bounds;
  const shown = entries.length > capacity ? Math.max(0, capacity - 1) : entries.length, cellWidth = legend.width / columns;
  ctx.font = "500 " + font + "px " + fontFamily; ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const label = (value: string, x: number, y: number, max: number) => { let text = value.slice(0, 240); while (text.length > 1 && ctx.measureText(text).width > max) text = text.slice(0, -2) + "…"; if (max >= font) ctx.fillText(text, x, y); };
  for (let index = 0; index < shown; index++) {
    const entry = entries[index], x = legend.left + (index % columns) * cellWidth + padding, y = legend.top + padding + (Math.floor(index / columns) + 0.5) * rowHeight;
    ctx.fillStyle = entry.colour; ctx.fillRect(x, y - font * 0.3, font * 0.65, font * 0.65);
    ctx.fillStyle = textColour; label(entry.label, x + font, y, cellWidth - padding * 2 - font);
  }
  if (shown < entries.length) { const index = shown, x = legend.left + (index % columns) * cellWidth + padding, y = legend.top + padding + (Math.floor(index / columns) + 0.5) * rowHeight; ctx.fillStyle = textColour; label("+" + (entries.length - shown), x, y, cellWidth - padding * 2); }
  return bounds;
}
