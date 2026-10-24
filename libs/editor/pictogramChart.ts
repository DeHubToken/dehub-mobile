import { drawPictogramSymbol } from "./pictogramSymbol";
import { chartValueLabel } from "./chartValueFormat";
import { drawChartLegend } from "./chartLegend";
import { graphicFontCss } from "./graphicFonts";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export function pictogramAllocation(values: readonly number[], count: number): number[] {
  const positive = values.map(value => Math.max(0, value)), total = positive.reduce((sum, value) => sum + value, 0);
  if (!total) return positive.map(() => 0);
  const shares = positive.map(value => value / total * count), result = shares.map(Math.floor);
  const ranked = shares.map((value, index) => ({ index, remainder: value - result[index] })).sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const remaining = count - result.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < remaining; index++) result[ranked[index % ranked.length].index]++;
  return result;
}
export function drawPictogramChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData): void {
  const rows = chart.rows.slice(0, 50), count = Math.max(10, Math.min(100, Math.round(chart.pictogramCount ?? 100)));
  const progress = chart.pictogramMode === "progress", filled = Math.max(0, Math.min(count, Math.round(rows[0]?.value ?? 0)));
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  if (!progress && !total) return;
  const colours = chart.colours.length ? chart.colours : ["#38bdf8"], colour = (index: number) => colours[index % colours.length];
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1)), family = graphicFontCss(chart.fontFamily);
  let entries = rows.map((row, index) => ({ row, index })).filter(item => item.row.value > 0).map(({ row, index }) => {
    const actual = chartValueLabel(row.value, chart.valueFormat), share = chartValueLabel(row.value / total * 100, { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 1, compact: false, locale: chart.valueFormat?.locale });
    const value = chart.pieValueMode === "percent" ? share : chart.pieValueMode === "both" ? actual + " (" + share + ")" : actual;
    return { colour: colour(index), label: [chart.showLabels ? row.label : "", chart.showValues ? value : ""].filter(Boolean).join("  ") };
  });
  if (progress) {
    const share = chartValueLabel(filled / count * 100, { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 0, compact: false, locale: chart.valueFormat?.locale });
    const actual = chartValueLabel(filled, undefined) + " / " + chartValueLabel(count, undefined), value = chart.pieValueMode === "percent" ? share : chart.pieValueMode === "both" ? actual + " (" + share + ")" : actual;
    entries = [{ colour: colour(0), label: [chart.showLabels ? rows[0]?.label ?? "" : "", chart.showValues ? value : ""].filter(Boolean).join("  ") }];
  }
  const frame = drawChartLegend(ctx, width, height, chart.showLegend !== false && (chart.showLabels || chart.showValues) ? entries : [], chart.legendPosition ?? "bottom", font, chart.textColour, family);
  const columns = Math.max(2, Math.min(20, chart.pictogramColumns ?? 10, count)), rowCount = Math.ceil(count / columns);
  const cell = Math.max(0, Math.min((frame.width - font * 2) / columns, (frame.height - font * 2) / rowCount));
  if (cell < 1) return;
  const x0 = frame.left + (frame.width - columns * cell) / 2, y0 = frame.top + (frame.height - rowCount * cell) / 2;
  const spacing = Math.max(0.08, Math.min(0.8, chart.barGap ?? 0.22)), size = cell * (1 - spacing), half = size / 2;
  const allocation = progress ? [filled, count - filled] : pictogramAllocation(rows.map(row => row.value), count);
  let icon = 0;
  allocation.forEach((amount, index) => {
    ctx.fillStyle = colour(index);
    for (let next = 0; next < amount; next++, icon++) {
      const x = x0 + (icon % columns + 0.5) * cell, y = y0 + (Math.floor(icon / columns) + 0.5) * cell;
      if (chart.pictogramShape === "symbol") { drawPictogramSymbol(ctx, chart.pictogramSymbol ?? "person", x, y, size, colour(index)); continue; }
      if (chart.pictogramShape === "square") ctx.fillRect(x - half, y - half, size, size);
      else if (chart.pictogramShape === "person") {
        ctx.beginPath(); ctx.arc(x, y - size * 0.33, size * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(x - size * 0.19, y - size * 0.1, size * 0.38, size * 0.32);
        ctx.fillRect(x - size * 0.35, y - size * 0.1, size * 0.7, size * 0.11);
        ctx.fillRect(x - size * 0.19, y + size * 0.16, size * 0.15, size * 0.34);
        ctx.fillRect(x + size * 0.04, y + size * 0.16, size * 0.15, size * 0.34);
      } else if (chart.pictogramShape === "diamond" || chart.pictogramShape === "star") {
        const points = chart.pictogramShape === "star" ? 10 : 4;
        ctx.beginPath();
        for (let point = 0; point < points; point++) { const angle = point / points * Math.PI * 2 - Math.PI / 2, radius = chart.pictogramShape === "star" && point % 2 ? half * 0.45 : half; const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius; if (point) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        ctx.closePath(); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(x, y, half, 0, Math.PI * 2); ctx.fill(); }
    }
  });
}
