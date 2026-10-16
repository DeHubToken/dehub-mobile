import { drawGraphicText } from "./graphicText";
import { graphicFontCss } from "./graphicFonts";
import { chartValueLabel } from "./chartValueFormat";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export function drawChartReference(ctx: DataVisualContext, chart: ChartData, x0: number, y0: number, x1: number, y1: number, minimum: number, maximum: number, font: number, percent = false): void {
  const reference = chart.referenceLine;
  if (!reference || !Number.isFinite(reference.value) || reference.value < minimum || reference.value > maximum) return;
  const horizontal = chart.kind === "bar", fraction = (reference.value - minimum) / (maximum - minimum || 1), position = horizontal ? x0 + fraction * (x1 - x0) : y1 - fraction * (y1 - y0);
  ctx.strokeStyle = reference.colour; ctx.fillStyle = reference.colour; ctx.lineWidth = Math.max(1, font / 10);
  ctx.beginPath();
  for (let segment = 0; segment < 24; segment++) {
    const from = segment / 24, to = (segment + 0.6) / 24;
    if (horizontal) { ctx.moveTo(position, y0 + (y1 - y0) * from); ctx.lineTo(position, y0 + (y1 - y0) * to); }
    else { ctx.moveTo(x0 + (x1 - x0) * from, position); ctx.lineTo(x0 + (x1 - x0) * to, position); }
  }
  ctx.stroke(); ctx.font = "600 " + font + "px " + graphicFontCss(chart.fontFamily); ctx.textBaseline = "middle";
  const number = percent ? chartValueLabel(reference.value, { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 0, compact: false, locale: chart.valueFormat?.locale }) : chartValueLabel(reference.value, chart.valueFormat);
  let text = [reference.label?.trim(), number].filter(Boolean).join(": "), available = Math.max(1, (x1 - x0) * 0.65);
  while (text.length > 1 && ctx.measureText(text).width > available) text = text.slice(0, -2) + "…";
  const measured = ctx.measureText(text).width;
  ctx.textAlign = horizontal ? "center" : "right";
  drawGraphicText(ctx,text, horizontal ? Math.max(x0 + measured / 2, Math.min(x1 - measured / 2, position)) : x1, horizontal ? y0 + font * 0.7 : Math.max(y0 + font / 2, Math.min(y1 - font / 2, position - font * 0.7)));
}
