import { percentStackedSeries } from "./percentStackedSeries";
import { traceChartLine } from "./chartLineStyle";
import { drawChartLegend } from "./chartLegend";
import { chartValueLabel } from "./chartValueFormat";
import type { ChartData, DataVisualContext } from "./dataVisuals";

/** Grouped and stacked charts use the same numeric scale for every series. */
export function drawMultiSeriesChart(ctx: DataVisualContext, width: number, height: number, chart: ChartData): boolean {
  if ((!chart.series?.length && chart.kind !== "scatter") || chart.kind === "pie" || chart.kind === "donut") return false;
  const rows = chart.rows.slice(0, 50), series = chart.series?.length ? chart.series.slice(0, 6) : [{ label: "Series 1", values: chart.rows.slice(0, 50).map(row => row.value) }];
  if (!rows.length) return false;
  const font = Math.max(8, Math.min(24, height / 18, width / 28));
  const colours = chart.colours.length ? chart.colours : ["#38bdf8"], colour = (index: number) => colours[index % colours.length];
  let values = series.map(item => rows.map((_, index) => Number.isFinite(item.values[index]) ? item.values[index] : 0));
  const stacked = !!chart.stacked && (chart.kind === "column" || chart.kind === "bar");
  const percentStack = stacked && !!chart.stackPercent;
  if (percentStack) values = percentStackedSeries(values);
  const positive = rows.map((_, index) => values.reduce((sum, set) => sum + Math.max(0, set[index]), 0));
  const negative = rows.map((_, index) => values.reduce((sum, set) => sum + Math.min(0, set[index]), 0));
  const minimum = percentStack ? negative.some(value => value < 0) ? -100 : 0 : Math.min(0, ...(stacked ? negative : values.flat()), Number.isFinite(chart.scaleMin) ? Number(chart.scaleMin) : 0), maximum = percentStack ? positive.some(value => value > 0) || !negative.some(value => value < 0) ? 100 : 0 : Math.max(0, ...(stacked ? positive : values.flat()), Number.isFinite(chart.scaleMax) ? Number(chart.scaleMax) : 0), span = maximum - minimum || 1;
  const labelValue = (value: number) => chartValueLabel(value, percentStack ? { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 0, compact: false, locale: chart.valueFormat?.locale, prefix: chart.valueFormat?.prefix, suffix: chart.valueFormat?.suffix } : chart.valueFormat);
  const legend = drawChartLegend(ctx, width, height, chart.series?.length && chart.showLegend !== false ? series.map((item, index) => ({ label: item.label, colour: colour(index) })) : [], chart.legendPosition ?? "bottom", font, chart.textColour);
  const xTitle = chart.kind === "radar" ? "" : (chart.xAxisTitle ?? "").replace(/\s+/g, " ").trim(), yTitle = chart.kind === "radar" ? "" : (chart.yAxisTitle ?? "").replace(/\s+/g, " ").trim();
  const left = legend.left, top = legend.top + (yTitle ? font * 1.6 : 0), frameWidth = legend.width, frameHeight = Math.max(1, legend.height - (yTitle ? font * 1.6 : 0) - (xTitle ? font * 1.6 : 0)), centreX = left + frameWidth / 2;
  ctx.font = "500 " + font + "px Inter, sans-serif"; ctx.textBaseline = "middle";
  function label(text: string, x: number, y: number, max: number) {
    if (max < font) return;
    let value = String(text).slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
    ctx.fillText(value, x, y);
  }
  ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
  if (xTitle) label(xTitle, centreX, legend.top + legend.height - font * 0.6, frameWidth - font * 2);
  if (yTitle) { ctx.textAlign = "left"; label(yTitle, left + font, legend.top + font * 0.6, frameWidth - font * 2); }
  if (chart.kind === "radar") {
    const radius = Math.max(1, Math.min(frameWidth, frameHeight) * (chart.showLabels ? 0.32 : 0.43)), cy = top + frameHeight / 2;
    const point = (index: number, value: number) => { const angle = index / rows.length * Math.PI * 2 - Math.PI / 2; return { x: centreX + Math.cos(angle) * radius * value, y: cy + Math.sin(angle) * radius * value }; };
    ctx.strokeStyle = chart.textColour + "66"; ctx.lineWidth = Math.max(1, width / 900);
    for (let ring = 1; chart.showGrid !== false && ring <= 4; ring++) { ctx.beginPath(); rows.forEach((_, index) => { const p = point(index, ring / 4); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke(); }
    rows.forEach((row, index) => { const p = point(index, 1); if (chart.showGrid !== false) { ctx.beginPath(); ctx.moveTo(centreX, cy); ctx.lineTo(p.x, p.y); ctx.stroke(); } if (chart.showLabels) { const q = point(index, 1.18); ctx.fillStyle = chart.textColour; ctx.textAlign = Math.abs(q.x - centreX) < font ? "center" : q.x < centreX ? "right" : "left"; label(row.label, q.x, q.y, Math.max(font, frameWidth / 2 - radius)); } });
    series.forEach((_, set) => {
      ctx.beginPath(); values[set].forEach((value, index) => { const p = point(index, (value - minimum) / span); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.fillStyle = colour(set) + Math.round((chart.areaOpacity ?? 0.149) * 255).toString(16).padStart(2, "0"); ctx.fill(); ctx.strokeStyle = colour(set); ctx.lineWidth = Math.max(2, width / 350) * (chart.lineWidth ?? 1); ctx.stroke();
      if (chart.showValues) values[set].forEach((value, index) => { const p = point(index, (value - minimum) / span); ctx.fillStyle = colour(set); ctx.textAlign = "center"; label(labelValue(value), p.x, p.y - font * (0.8 + set * 0.7), Math.max(font * 2, width / rows.length)); });
    });
    return true;
  }
  if (chart.kind === "scatter") {
    const xs = rows.map(row => Number(row.label));
    if (xs.some(value => !Number.isFinite(value))) return true;
    const rawMinX = Math.min(...xs), rawMaxX = Math.max(...xs), padding = (rawMaxX - rawMinX || Math.max(1, Math.abs(rawMinX) * 0.1)) * 0.05;
    const minX = rawMinX - padding, maxX = rawMaxX + padding, spanX = maxX - minX || 1;
    const showGrid = chart.showGrid ?? !!chart.series?.length, showScale = chart.showAxisValues ?? !!chart.series?.length;
    const x0 = left + font * (showScale ? 3 : 1), x1 = left + frameWidth - font, y0 = top + font * 1.5, y1 = top + frameHeight - (chart.showLabels ? font * 2.5 : font);
    const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0), xFor = (value: number) => x0 + (value - minX) / spanX * plotWidth, yFor = (value: number) => y1 - (value - minimum) / span * plotHeight;
    ctx.lineWidth = Math.max(1, width / 900);
    for (let tick = 0; tick <= 4; tick++) {
      const x = x0 + plotWidth * tick / 4, y = y1 - plotHeight * tick / 4;
      if (showGrid) { ctx.strokeStyle = chart.textColour + "33"; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      ctx.fillStyle = chart.textColour;
      if (showScale) { ctx.textAlign = "right"; label(labelValue(Number((minimum + span * tick / 4).toPrecision(3))), x0 - font / 2, y, font * 2.5); }
      if (chart.showLabels) { ctx.textAlign = "center"; label(chartValueLabel(Number((minX + spanX * tick / 4).toPrecision(3)), undefined), x, y1 + font * 1.2, plotWidth / 4 * 0.95); }
    }
    ctx.strokeStyle = chart.textColour; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    if (chart.scatterLines) series.forEach((_, set) => {
      ctx.strokeStyle = colour(set); ctx.lineWidth = Math.max(2, width / 350) * (chart.lineWidth ?? 1);
      ctx.beginPath(); traceChartLine(ctx, values[set].map((value, index) => ({ x: xFor(xs[index]), y: yFor(value) })), chart.lineStyle); ctx.stroke();
    });
    series.forEach((_, set) => values[set].forEach((value, index) => {
      const x = xFor(xs[index]), y = yFor(value), pointColour = chart.series?.length ? colour(set) : colour(index);
      ctx.fillStyle = pointColour; ctx.beginPath(); ctx.arc(x, y, Math.max(2, width / 220) * (chart.pointSize ?? 1), 0, Math.PI * 2); ctx.fill();
      if (chart.showValues) { ctx.textAlign = "center"; label(labelValue(value), x, y - font * 0.8, Math.max(font * 3, plotWidth / rows.length)); }
    }));
    return true;
  }
  const horizontal = chart.kind === "bar", labelSpace = chart.showLabels ? (horizontal ? frameWidth * 0.25 : font * 2.5) : font;
  const x0 = left + (horizontal ? labelSpace : font * (chart.showAxisValues !== false ? 3 : 1)), x1 = left + frameWidth - font, y0 = top + font * 1.5, y1 = top + frameHeight - (horizontal ? chart.showAxisValues !== false ? font * 2.5 : font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const xFor = (value: number) => x0 + (value - minimum) / span * plotWidth, yFor = (value: number) => y1 - (value - minimum) / span * plotHeight;
  const zeroX = xFor(0), zeroY = yFor(0);
  ctx.lineWidth = Math.max(1, width / 900);
  for (let tick = 0; tick <= 4; tick++) {
    const value = minimum + span * tick / 4, x = xFor(value), y = yFor(value);
    if (chart.showGrid !== false) { ctx.strokeStyle = chart.textColour + "33"; ctx.beginPath(); ctx.moveTo(horizontal ? x : x0, horizontal ? y0 : y); ctx.lineTo(horizontal ? x : x1, horizontal ? y1 : y); ctx.stroke(); }
    if (chart.showAxisValues !== false) { ctx.fillStyle = chart.textColour; ctx.textAlign = horizontal ? "center" : "right"; label(labelValue(Number(value.toPrecision(3))), horizontal ? x : x0 - font / 2, horizontal ? y1 + font * 1.2 : y, horizontal ? plotWidth / 4 * 0.95 : font * 2.5); }
  }
  ctx.strokeStyle = chart.textColour; ctx.beginPath(); if (horizontal) { ctx.moveTo(zeroX, y0); ctx.lineTo(zeroX, y1); } else { ctx.moveTo(x0, zeroY); ctx.lineTo(x1, zeroY); } ctx.stroke();
  const up = rows.map(() => 0), down = rows.map(() => 0);
  series.forEach((_, set) => {
    const colourValue = colour(set); ctx.fillStyle = colourValue; ctx.strokeStyle = colourValue; ctx.lineWidth = Math.max(2, width / 300) * (chart.lineWidth ?? 1);
    if (chart.kind === "line" || chart.kind === "area") {
      ctx.beginPath(); traceChartLine(ctx, values[set].map((value, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: yFor(value) })), chart.lineStyle); ctx.stroke();
      if (chart.kind === "area") { ctx.lineTo(x0 + (rows.length - 0.5) / rows.length * plotWidth, zeroY); ctx.lineTo(x0 + 0.5 / rows.length * plotWidth, zeroY); ctx.closePath(); ctx.fillStyle = colourValue + Math.round((chart.areaOpacity ?? 0.149) * 255).toString(16).padStart(2, "0"); ctx.fill(); }
    }
    values[set].forEach((value, index) => {
      ctx.fillStyle = colourValue;
      const base = stacked ? value >= 0 ? up[index] : down[index] : 0;
      if (stacked) { if (value >= 0) up[index] += value; else down[index] += value; }
      if (horizontal) {
        const slot = plotHeight / rows.length, band = slot * (1 - (chart.barGap ?? 0.24)), thickness = stacked ? band : band / series.length;
        const y = y0 + slot * (index + 0.5) - band / 2 + (stacked ? 0 : set * thickness), from = xFor(base), to = xFor(base + value);
        ctx.fillRect(Math.min(from, to), y, Math.abs(to - from), Math.max(0.1, thickness * 0.92));
        if (chart.showValues) { ctx.textAlign = "center"; ctx.fillStyle = chart.textColour; label(labelValue(value), (from + to) / 2, y + thickness / 2, Math.max(1, Math.abs(to - from) - 4)); }
      } else {
        const slot = plotWidth / rows.length, grouped = chart.kind === "column" || chart.kind === "lollipop", band = slot * (1 - (chart.barGap ?? 0.24)), thickness = stacked || !grouped ? band : band / series.length;
        const x = x0 + slot * (index + 0.5) + (grouped && !stacked ? -band / 2 + (set + 0.5) * thickness : 0), from = yFor(base), to = yFor(base + value);
        if (chart.kind === "column") ctx.fillRect(x - thickness * 0.46, Math.min(from, to), Math.max(0.1, thickness * 0.92), Math.abs(to - from));
        else { if (chart.kind === "lollipop") { ctx.strokeStyle = colourValue; ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, to); ctx.stroke(); } ctx.beginPath(); ctx.arc(x, to, Math.max(2, width / 220) * (chart.pointSize ?? 1), 0, Math.PI * 2); ctx.fill(); }
        if (chart.showValues) { ctx.textAlign = "center"; ctx.fillStyle = chart.textColour; label(labelValue(value), x, stacked ? (from + to) / 2 : Math.max(top + font / 2, to - font * 0.7), Math.max(1, thickness)); }
      }
    });
  });
  if (chart.showLabels) rows.forEach((row, index) => { ctx.fillStyle = chart.textColour; if (horizontal) { ctx.textAlign = "right"; label(row.label, x0 - font / 2, y0 + (index + 0.5) / rows.length * plotHeight, labelSpace - font); } else { ctx.textAlign = "center"; label(row.label, x0 + (index + 0.5) / rows.length * plotWidth, y1 + font * 1.2, plotWidth / rows.length * 0.95); } });
  return true;
}
