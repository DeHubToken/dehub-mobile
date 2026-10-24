export const MULTI_SERIES_CHARTS_RUNTIME = String.raw`function drawMultiSeriesChart(ctx, width, height, chart) {
  if ((!chart.series?.length && chart.kind !== "scatter" && chart.kind !== "bubble" && !(chart.kind === "area" && chart.areaMode && chart.areaMode !== "overlay")) || chart.kind === "pie" || chart.kind === "donut" || chart.kind === "funnel") return false;
  const family = graphicFontCss(chart.fontFamily);
  const rows = chart.rows.slice(0, 50), availableSeries = chart.series?.length ? chart.series.slice(0, 6) : [{ label: "Series 1", values: chart.rows.slice(0, 50).map(row => row.value) }];
  const series = chart.kind === "bubble" ? [availableSeries[chart.bubbleYSeries ?? 0] ?? availableSeries[0]] : availableSeries;
  if (!rows.length) return false;
  const intervals = Math.max(1, Math.min(20, Math.round(chart.scaleIntervals ?? 4))), xIntervals = Math.max(1, Math.min(20, Math.round(chart.scaleXIntervals ?? 4)));
  const font = Math.max(8, Math.min(24, height / 18, width / 28)) * Math.max(0.5, Math.min(3, chart.fontScale || 1));
  const colours = chart.colours.length ? chart.colours : ["#38bdf8"], colour = (index) => colours[index % colours.length];
  let values = series.map(item => rows.map((_, index) => Number.isFinite(item.values[index]) ? item.values[index] : 0));
  const areaMode = chart.kind === "area" ? chart.areaMode ?? "overlay" : "overlay", areaStack = areaMode !== "overlay", stream = areaMode === "stream";
  const stacked = !!chart.stacked && (chart.kind === "column" || chart.kind === "bar") || areaStack;
  const percentStack = areaMode === "percent" || stacked && !areaStack && !!chart.stackPercent;
  if (percentStack) values = percentStackedSeries(values);
  const positive = rows.map((_, index) => values.reduce((sum, set) => sum + Math.max(0, set[index]), 0));
  const negative = rows.map((_, index) => values.reduce((sum, set) => sum + Math.min(0, set[index]), 0));
  const scaleBottom = stream ? positive.map(value => -value / 2) : stacked ? negative : values.flat(), scaleTop = stream ? positive.map(value => value / 2) : stacked ? positive : values.flat();
  const reference = chart.kind === "radar" || stream ? 0 : chart.referenceLine?.value ?? 0;
  const minimum = percentStack ? negative.some(value => value < 0) || reference < 0 ? -100 : 0 : Math.min(0, reference, ...scaleBottom, Number.isFinite(chart.scaleMin) ? Number(chart.scaleMin) : 0), maximum = percentStack ? positive.some(value => value > 0) || reference > 0 || !negative.some(value => value < 0) ? 100 : 0 : Math.max(0, reference, ...scaleTop, Number.isFinite(chart.scaleMax) ? Number(chart.scaleMax) : 0), span = maximum - minimum || 1;
  const labelValue = (value) => chartValueLabel(value, percentStack ? { style: "percent", currency: "USD", decimals: chart.valueFormat?.decimals ?? 0, compact: false, locale: chart.valueFormat?.locale, prefix: chart.valueFormat?.prefix, suffix: chart.valueFormat?.suffix } : chart.valueFormat);
  const legend = drawChartLegend(ctx, width, height, chart.kind !== "bubble" && chart.series?.length && chart.showLegend !== false ? series.map((item, index) => ({ label: item.label, colour: colour(index), ...(["line", "area", "dot", "lollipop", "scatter", "radar"].includes(chart.kind) ? { marker: chart.kind !== "radar" && (chart.pointSize ?? 1) > 0 ? chartSeriesPattern(chart, index).marker : undefined, linePattern: chart.kind !== "dot" && (chart.kind !== "scatter" || chart.scatterLines) ? chartSeriesPattern(chart, index).linePattern : undefined } : {}) })) : [], chart.legendPosition ?? "bottom", font, chart.textColour, family);
  const xTitle = chart.kind === "radar" ? "" : (chart.xAxisTitle ?? "").replace(/\s+/g, " ").trim(), yTitle = chart.kind === "radar" ? "" : (chart.yAxisTitle ?? "").replace(/\s+/g, " ").trim();
  const left = legend.left, top = legend.top + (yTitle ? font * 1.6 : 0), frameWidth = legend.width, frameHeight = Math.max(1, legend.height - (yTitle ? font * 1.6 : 0) - (xTitle ? font * 1.6 : 0)), centreX = left + frameWidth / 2;
  ctx.font = "500 " + font + "px " + family; ctx.textBaseline = "middle";
  function label(text, x, y, max) {
    if (max < font) return;
    let value = String(text).slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
    drawGraphicText(ctx,value, x, y);
  }
  ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
  if (xTitle) label(xTitle, centreX, legend.top + legend.height - font * 0.6, frameWidth - font * 2);
  if (yTitle) { ctx.textAlign = "left"; label(yTitle, left + font, legend.top + font * 0.6, frameWidth - font * 2); }
  if (chart.kind === "radar") {
    const radius = Math.max(1, Math.min(frameWidth, frameHeight) * (chart.showLabels ? 0.32 : 0.43)), cy = top + frameHeight / 2;
    const point = (index, value) => { const angle = index / rows.length * Math.PI * 2 - Math.PI / 2; return { x: centreX + Math.cos(angle) * radius * value, y: cy + Math.sin(angle) * radius * value }; };
    ctx.strokeStyle = chart.textColour + "66"; ctx.lineWidth = Math.max(1, width / 900);
    for (let ring = 1; chart.showGrid !== false && ring <= intervals; ring++) { ctx.beginPath(); rows.forEach((_, index) => { const p = point(index, ring / intervals); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke(); }
    rows.forEach((row, index) => { const p = point(index, 1); if (chart.showGrid !== false) { ctx.beginPath(); ctx.moveTo(centreX, cy); ctx.lineTo(p.x, p.y); ctx.stroke(); } if (chart.showLabels) { const q = point(index, 1.18); ctx.fillStyle = chart.textColour; ctx.textAlign = Math.abs(q.x - centreX) < font ? "center" : q.x < centreX ? "right" : "left"; label(row.label, q.x, q.y, Math.max(font, frameWidth / 2 - radius)); } });
    series.forEach((_, set) => {
      ctx.beginPath(); values[set].forEach((value, index) => { const p = point(index, (value - minimum) / span); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.fillStyle = colour(set) + Math.round((chart.areaOpacity ?? 0.149) * 255).toString(16).padStart(2, "0"); ctx.fill(); ctx.strokeStyle = colour(set); ctx.lineWidth = Math.max(2, width / 350) * (chart.lineWidth ?? 1); strokeChartPattern(ctx, chartSeriesPattern(chart, set).linePattern);
      if (chart.showValues) values[set].forEach((value, index) => { const p = point(index, (value - minimum) / span); ctx.fillStyle = colour(set); ctx.textAlign = "center"; label(labelValue(value), p.x, p.y - font * (0.8 + set * 0.7), Math.max(font * 2, width / rows.length)); });
    });
    return true;
  }
  if (chart.kind === "scatter" || chart.kind === "bubble") {
    const xs = rows.map(row => chartXValue(row.label, chart.xAxisMode));
    if (xs.some(value => !Number.isFinite(value))) return true;
    const rawMinX = Math.min(...xs), rawMaxX = Math.max(...xs), padding = (rawMaxX - rawMinX || (chart.xAxisMode === "date" ? 86400000 : Math.max(1, Math.abs(rawMinX) * 0.1))) * 0.05;
    const minX = Math.max(chart.xAxisMode === "date" ? CHART_DATE_MIN : -Infinity, Math.min(rawMinX - padding, chart.scaleXMin ?? rawMinX)), maxX = Math.min(chart.xAxisMode === "date" ? CHART_DATE_MAX : Infinity, Math.max(rawMaxX + padding, chart.scaleXMax ?? rawMaxX)), spanX = maxX - minX || 1;
    const bubble = chart.kind === "bubble", sizes = rows.map((_, index) => Math.max(0, chart.series?.[chart.bubbleSizeSeries ?? 1]?.values[index] ?? 1)), maxSize = Math.max(1e-12, ...sizes);
    const bubbleRadius = bubble ? Math.max(1, Math.min(frameWidth, frameHeight) * Math.min(0.22, 0.07 * Math.max(0.25, chart.pointSize ?? 1))) : 0;
    const showGrid = chart.showGrid ?? (bubble || !!chart.series?.length), showScale = chart.showAxisValues ?? (bubble || !!chart.series?.length);
    const x0 = left + font * (showScale ? 3 : 1) + bubbleRadius, x1 = left + frameWidth - font - bubbleRadius, y0 = top + font * 1.5 + bubbleRadius, y1 = top + frameHeight - (chart.showLabels ? font * 2.5 : font) - bubbleRadius;
    const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0), xFor = (value) => x0 + (value - minX) / spanX * plotWidth, yFor = (value) => y1 - (value - minimum) / span * plotHeight;
    ctx.lineWidth = Math.max(1, width / 900);
    for (let tick = 0; tick <= intervals; tick++) {
      const y = y1 - plotHeight * tick / intervals;
      if (showGrid) { ctx.strokeStyle = chart.textColour + "33"; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
      ctx.fillStyle = chart.textColour;
      if (showScale) { ctx.textAlign = "right"; label(labelValue(Number((minimum + span * tick / intervals).toPrecision(3))), x0 - font / 2, y, font * 2.5); }
    }
    for (let tick = 0; tick <= xIntervals; tick++) {
      const x = x0 + plotWidth * tick / xIntervals;
      if (showGrid) { ctx.strokeStyle = chart.textColour + "33"; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
      ctx.fillStyle = chart.textColour;
      if (chart.showLabels) { ctx.textAlign = "center"; label(chartXLabel(chart.xAxisMode === "date" ? minX + spanX * tick / xIntervals : Number((minX + spanX * tick / xIntervals).toPrecision(3)), chart), x, y1 + font * 1.2, plotWidth / xIntervals * 0.95); }
    }
    ctx.strokeStyle = chart.textColour; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
    if (!bubble && chart.scatterLines) series.forEach((_, set) => {
      ctx.strokeStyle = colour(set); ctx.lineWidth = Math.max(2, width / 350) * (chart.lineWidth ?? 1);
      ctx.beginPath(); traceChartLine(ctx, values[set].map((value, index) => ({ x: xFor(xs[index]), y: yFor(value) })), chart.lineStyle); strokeChartPattern(ctx, chartSeriesPattern(chart, set).linePattern);
    });
    const pointOrder = rows.map((_, index) => index);
    if (bubble) pointOrder.sort((a, b) => sizes[b] - sizes[a]);
    series.forEach((_, set) => pointOrder.forEach(index => {
      const value = values[set][index], x = xFor(xs[index]), y = yFor(value), pointColour = bubble || !chart.series?.length ? colour(index) : colour(set);
      const radius = bubble ? bubbleRadius * Math.sqrt(sizes[index] / maxSize) : Math.max(2, width / 220) * (chart.pointSize ?? 1);
      if (radius <= 0) return;
      ctx.fillStyle = bubble ? pointColour + Math.round((chart.areaOpacity ?? 0.55) * 255).toString(16).padStart(2, "0") : pointColour;
      if (bubble) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); } else drawChartMarker(ctx, x, y, radius, chartSeriesPattern(chart, set).marker);
      if (bubble) { ctx.strokeStyle = pointColour; ctx.lineWidth = Math.max(1, width / 900) * (chart.lineWidth ?? 1); ctx.stroke(); }
      if (chart.showValues) { const pointLabel = chart.pointLabelMode === "coordinates" ? "(" + chartXLabel(xs[index], chart) + ", " + labelValue(value) + ")" : labelValue(value); ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; label(bubble ? pointLabel + " / " + chartValueLabel(sizes[index], undefined) : pointLabel, x, y - (bubble ? radius + font * 0.6 : font * 0.8), Math.max(font * 3, plotWidth / rows.length)); }
    }));
    drawChartReference(ctx, chart, x0, y0, x1, y1, minimum, maximum, font);
    return true;
  }
  const horizontal = chart.kind === "bar", labelSpace = chart.showLabels ? (horizontal ? frameWidth * 0.25 : chartCategoryLabelSpace(chart, font, frameHeight)) : font;
  const x0 = left + (horizontal ? labelSpace : font * (chart.showAxisValues !== false ? 3 : 1)), x1 = left + frameWidth - font, y0 = top + font * 1.5, y1 = top + frameHeight - (horizontal ? chart.showAxisValues !== false ? font * 2.5 : font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const xFor = (value) => x0 + (value - minimum) / span * plotWidth, yFor = (value) => y1 - (value - minimum) / span * plotHeight;
  const zeroX = xFor(0), zeroY = yFor(0);
  ctx.lineWidth = Math.max(1, width / 900);
  for (let tick = 0; tick <= intervals; tick++) {
    const value = minimum + span * tick / intervals, x = xFor(value), y = yFor(value);
    if (chart.showGrid !== false) { ctx.strokeStyle = chart.textColour + "33"; ctx.beginPath(); ctx.moveTo(horizontal ? x : x0, horizontal ? y0 : y); ctx.lineTo(horizontal ? x : x1, horizontal ? y1 : y); ctx.stroke(); }
    if (chart.showAxisValues !== false) { ctx.fillStyle = chart.textColour; ctx.textAlign = horizontal ? "center" : "right"; label(labelValue(Number(value.toPrecision(3))), horizontal ? x : x0 - font / 2, horizontal ? y1 + font * 1.2 : y, horizontal ? plotWidth / intervals * 0.95 : font * 2.5); }
  }
  ctx.strokeStyle = chart.textColour; ctx.beginPath(); if (horizontal) { ctx.moveTo(zeroX, y0); ctx.lineTo(zeroX, y1); } else { ctx.moveTo(x0, zeroY); ctx.lineTo(x1, zeroY); } ctx.stroke();
  if (areaStack) {
    const bands = stackedAreaBands(values, stream);
    series.forEach((_, set) => {
      const band = bands[set], upper = band.upper.map((value, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: yFor(value) })), lower = band.lower.map((value, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: yFor(value) }));
      ctx.fillStyle = colour(set) + Math.round((chart.areaOpacity ?? 0.8) * 255).toString(16).padStart(2, "0"); ctx.beginPath();
      traceStackedAreaBoundary(ctx, upper, chart.lineStyle); traceStackedAreaBoundary(ctx, [...lower].reverse(), chart.lineStyle, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = colour(set); ctx.lineWidth = Math.max(2, width / 300) * (chart.lineWidth ?? 1); ctx.beginPath(); traceStackedAreaBoundary(ctx, upper, chart.lineStyle); strokeChartPattern(ctx, chartSeriesPattern(chart, set).linePattern);
      upper.forEach((point, index) => { ctx.fillStyle = colour(set); drawChartMarker(ctx, point.x, point.y, Math.max(2, width / 220) * (chart.pointSize ?? 1), chartSeriesPattern(chart, set).marker); if (chart.showValues && values[set][index] > 0) { ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; label(labelValue(values[set][index]), point.x, yFor((band.upper[index] + band.lower[index]) / 2), chartCategoryLabelWidth(chart, index, rows.length, plotWidth / rows.length)); } });
    });
  } else {
  const up = rows.map(() => 0), down = rows.map(() => 0);
  series.forEach((_, set) => {
    const colourValue = colour(set); ctx.fillStyle = colourValue; ctx.strokeStyle = colourValue; ctx.lineWidth = Math.max(2, width / 300) * (chart.lineWidth ?? 1);
    if (chart.kind === "line" || chart.kind === "area") {
      ctx.beginPath(); traceChartLine(ctx, values[set].map((value, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: yFor(value) })), chart.lineStyle); strokeChartPattern(ctx, chartSeriesPattern(chart, set).linePattern);
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
        else { if (chart.kind === "lollipop") { ctx.strokeStyle = colourValue; ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, to); strokeChartPattern(ctx, chartSeriesPattern(chart, set).linePattern); } drawChartMarker(ctx, x, to, Math.max(2, width / 220) * (chart.pointSize ?? 1), chartSeriesPattern(chart, set).marker); }
        if (chart.showValues) { ctx.textAlign = "center"; ctx.fillStyle = chart.textColour; label(labelValue(value), x, stacked ? (from + to) / 2 : Math.max(top + font / 2, to - font * 0.7), Math.max(1, thickness)); }
      }
    });
  });
  }
  if (chart.showLabels) rows.forEach((row, index) => { if (!showChartCategoryLabel(chart, index, rows.length)) return; ctx.fillStyle = chart.textColour; if (horizontal) { ctx.textAlign = "right"; const y = y0 + (index + 0.5) / rows.length * plotHeight; if (chart.labelWrap) drawChartCategoryLabel(ctx, row.label, x0 - font / 2, y, labelSpace - font, Math.min(font, plotHeight / rows.length * 0.4), 2, true); else label(row.label, x0 - font / 2, y, labelSpace - font); } else { ctx.textAlign = "center"; const x = x0 + (index + 0.5) / rows.length * plotWidth; if (chart.labelAngle) drawAngledCategoryLabel(ctx, row.label, x, y1 + font, Math.max(font, labelSpace - font * 2), x0, x1, font, chart.labelAngle); else if (chart.labelWrap) drawChartCategoryLabel(ctx, row.label, x, y1 + font, chartCategoryLabelWidth(chart, index, rows.length, plotWidth / rows.length), font, 3); else label(row.label, x, y1 + font * 1.2, chartCategoryLabelWidth(chart, index, rows.length, plotWidth / rows.length)); } });
  if (!stream) drawChartReference(ctx, chart, x0, y0, x1, y1, minimum, maximum, font, percentStack);
  return true;
}
`;
