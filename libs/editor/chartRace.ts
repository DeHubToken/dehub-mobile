import { drawGraphicText } from "./graphicText";
import { chartValueLabel } from "./chartValueFormat";
import { graphicFontCss } from "./graphicFonts";
import type { ChartData, DataVisualContext } from "./dataVisuals";
export function drawChartRace(ctx: DataVisualContext, width: number, height: number, chart: ChartData, progress?: number): void {
  const rows = chart.rows.slice(0, 50), frames = chart.series?.slice(0, 6);
  if (!rows.length || !frames || frames.length < 2) return;
  const at = Math.max(0, Math.min(1, chart.raceAnimate === false ? chart.racePoster ?? 0 : progress ?? chart.racePoster ?? 0)) * (frames.length - 1);
  const first = Math.min(frames.length - 2, Math.floor(at)), next = first + 1, blend = at - first;
  const ranking = (values: readonly number[]) => {
    const indices = rows.map((_, index) => index).sort((a, b) => values[b] - values[a] || a - b), ranks = rows.map(() => 0);
    indices.forEach((index, rank) => { ranks[index] = rank; }); return ranks;
  };
  const from = frames[first].values, to = frames[next].values, fromRanks = ranking(from), toRanks = ranking(to);
  const maximum = Math.max(1e-12, ...frames.flatMap(frame => frame.values), chart.scaleMax ?? 0);
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1)), family = graphicFontCss(chart.fontFamily);
  const topCount = Math.min(rows.length, chart.raceTop ?? 10), left = -width / 2, top = -height / 2;
  const labelSpace = chart.showLabels ? width * 0.24 : font, valueSpace = chart.showValues ? width * 0.2 : font;
  const x0 = left + labelSpace, x1 = width / 2 - valueSpace, y0 = top + font * 2.5, y1 = height / 2 - font * 2;
  const plotWidth = Math.max(1, x1 - x0), slot = Math.max(1, y1 - y0) / Math.max(1, topCount), rowFont = Math.min(font, slot * 0.4);
  const colours = chart.colours.length ? chart.colours : ["#38bdf8"], gap = Math.max(0, Math.min(0.9, chart.barGap ?? 0.25));
  const label = (text: string, x: number, y: number, available: number, size: number) => {
    if (available < size) return;
    ctx.font = "500 " + size + "px " + family;
    let value = text.slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > available) value = value.slice(0, -2) + "…";
    if (ctx.measureText(value).width <= available) drawGraphicText(ctx,value, x, y);
  };
  ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  label(blend <= 0 ? frames[first].label : blend >= 1 ? frames[next].label : frames[first].label + " → " + frames[next].label, 0, top + font, width - font * 2, font);
  for (let tick = 0; tick <= 4; tick++) {
    const x = x0 + plotWidth * tick / 4;
    if (chart.showGrid !== false) { ctx.strokeStyle = chart.textColour + "33"; ctx.lineWidth = Math.max(1, width / 900); ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    if (chart.showAxisValues !== false) { ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; label(chartValueLabel(maximum * tick / 4, chart.valueFormat), x, y1 + font, plotWidth / 4 * 0.9, font * 0.75); }
  }
  rows.forEach((row, index) => {
    const rank = fromRanks[index] + (toRanks[index] - fromRanks[index]) * blend;
    if (rank > topCount - 1) return;
    const value = from[index] + (to[index] - from[index]) * blend, y = y0 + slot * (rank + 0.5), barWidth = Math.max(0, value) / maximum * plotWidth;
    ctx.fillStyle = colours[index % colours.length]; ctx.fillRect(x0, y - slot * (1 - gap) / 2, barWidth, slot * (1 - gap));
    ctx.fillStyle = chart.textColour;
    if (chart.showLabels) { ctx.textAlign = "right"; label(row.label, x0 - rowFont / 2, y, labelSpace - rowFont, rowFont); }
    if (chart.showValues) { ctx.textAlign = "left"; label(chartValueLabel(value, chart.valueFormat), x0 + barWidth + rowFont / 2, y, width / 2 - (x0 + barWidth) - rowFont, rowFont); }
  });
}
