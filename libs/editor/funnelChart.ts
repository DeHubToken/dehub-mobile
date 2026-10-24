import { drawGraphicText } from "./graphicText";
import { graphicFontCss } from "./graphicFonts";
import { chartValueLabel } from "./chartValueFormat";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export function drawFunnelChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData, font: number): void {
  const rows = chart.rows.slice(0, 50), maximum = Math.max(0, ...rows.map(row => row.value));
  if (!rows.length || maximum <= 0) return;
  const left = -width / 2 + font, right = width / 2 - font, top = -height / 2 + font, bottom = height / 2 - font;
  const labelSpace = chart.showLabels ? Math.min(width * 0.25, font * 12) : 0, valueSpace = chart.showValues ? Math.min(width * 0.25, font * 12) : 0;
  const x0 = left + labelSpace, x1 = right - valueSpace, centre = (x0 + x1) / 2, plotWidth = Math.max(1, x1 - x0), slot = Math.max(1, (bottom - top) / rows.length), gap = slot * (chart.barGap ?? 0.08), size = Math.max(1, Math.min(font, slot * 0.7));
  const colours = chart.colours.length ? chart.colours : ["#38bdf8"];
  ctx.font = "500 " + size + "px " + graphicFontCss(chart.fontFamily); ctx.textBaseline = "middle";
  function label(text: string, x: number, y: number, max: number) { if (max < size) return; let value = text.slice(0, 200); while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…"; drawGraphicText(ctx,value, x, y); }
  rows.forEach((row, index) => {
    const y = top + index * slot + gap / 2, topHalf = Math.max(0, row.value) / maximum * plotWidth / 2, bottomHalf = Math.max(0, rows[index + 1]?.value ?? row.value) / maximum * plotWidth / 2;
    ctx.fillStyle = colours[index % colours.length]; ctx.beginPath(); ctx.moveTo(centre - topHalf, y); ctx.lineTo(centre + topHalf, y); ctx.lineTo(centre + bottomHalf, y + slot - gap); ctx.lineTo(centre - bottomHalf, y + slot - gap); ctx.closePath(); ctx.fill();
    ctx.fillStyle = chart.textColour;
    if (chart.showLabels) { ctx.textAlign = "right"; label(row.label, x0 - size * 0.5, y + (slot - gap) / 2, labelSpace - size); }
    if (chart.showValues) { ctx.textAlign = "left"; label(chartValueLabel(row.value, chart.valueFormat), x1 + size * 0.5, y + (slot - gap) / 2, valueSpace - size); }
  });
}
