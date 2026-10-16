/** Chart and table drawing shared with the web compositor. */
export const DATA_VISUAL_RUNTIME = String.raw`function drawDataVisual(ctx, width, height, chart, table) {
  const left = -width / 2, top = -height / 2;
  const font = Math.max(8, Math.min(24, height / 18, width / 28));
  ctx.font = "500 " + font + "px Inter, sans-serif";
  ctx.textBaseline = "middle";
  function label(text, x, y, max) {
    let value = String(text).slice(0, 200);
    while (value.length > 1 && ctx.measureText(value).width > max) value = value.slice(0, -2) + "…";
    ctx.fillText(value, x, y);
  }
  if (table && Array.isArray(table.rows)) { drawEditableTable(ctx, width, height, table); return; }
  if (!chart || !Array.isArray(chart.rows)) return;
  const rows = chart.rows.slice(0, 50).filter(row => row && typeof row.label === "string" && Number.isFinite(row.value));
  if (!rows.length) return;
  if (drawMultiSeriesChart(ctx, width, height, chart)) return;
  const colours = Array.isArray(chart.colours) && chart.colours.length ? chart.colours.slice(0, 50) : ["#38bdf8"];
  const colour = (index) => colours[index % colours.length];
  const max = Math.max(0, ...rows.map(row => row.value), Number.isFinite(chart.scaleMax) ? Number(chart.scaleMax) : 0);
  const min = Math.min(0, ...rows.map(row => row.value), Number.isFinite(chart.scaleMin) ? Number(chart.scaleMin) : 0);
  const span = max - min || 1;
  if (chart.kind === "pie" || chart.kind === "donut") {
    const positive = rows.map((row, colourIndex) => ({ ...row, colourIndex })).filter(row => row.value > 0), sum = positive.reduce((n, row) => n + row.value, 0);
    const entries = chart.showLabels && chart.showLegend !== false ? positive.map(row => ({ colour: colour(row.colourIndex), label: row.label + (chart.showValues ? "  " + (chart.valueFormat ? chartValueLabel(row.value, chart.valueFormat) : Number((row.value / sum * 100).toFixed(1)) + "%") : "") })) : [];
    const plot = drawChartLegend(ctx, width, height, entries, chart.legendPosition ?? "right", font, chart.textColour);
    const radius = Math.max(1, Math.min(plot.width * 0.45, plot.height * 0.45));
    const cx = plot.left + plot.width / 2, cy = plot.top + plot.height / 2;
    let start = -Math.PI / 2;
    positive.forEach((row, index) => {
      const end = start + row.value / sum * Math.PI * 2;
      ctx.fillStyle = colour(row.colourIndex); ctx.beginPath();
      if (chart.kind === "donut") {
        ctx.arc(cx, cy, radius, start, end); ctx.arc(cx, cy, radius * Math.max(0.2, Math.min(0.85, chart.donutHole ?? 0.57)), end, start, true);
      } else { ctx.moveTo(cx, cy); ctx.arc(cx, cy, radius, start, end); }
      ctx.closePath(); ctx.fill();
      start = end;
    });
    if (chart.kind === "donut") {
      const caption = typeof chart.donutLabel === "string" ? chart.donutLabel.replace(/\s+/g, " ").trim().slice(0, 80) : "", total = chart.donutTotal ? chartValueLabel(sum, chart.valueFormat) : "";
      const labels = [total, caption].filter(Boolean), hole = radius * Math.max(0.2, Math.min(0.85, chart.donutHole ?? 0.57));
      if (labels.length) {
        let size = Math.max(1, Math.min(font * 1.8, hole * (labels.length > 1 ? 0.45 : 0.7)));
        while (size > 1) { ctx.font = "700 " + size + "px Inter, sans-serif"; if (labels.every(value => ctx.measureText(value).width <= hole * 1.65)) break; size = Math.max(1, size - 1); }
        ctx.fillStyle = chart.textColour; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        labels.forEach((value, index) => { ctx.font = (total && index === 0 ? "700 " : "500 ") + (total && index > 0 ? size * 0.75 : size) + "px Inter, sans-serif"; ctx.fillText(value, cx, cy + (index - (labels.length - 1) / 2) * size * 1.25); });
      }
    }
    return;
  }
  if (chart.kind === "radar") {
    const radius = Math.max(1, Math.min(width, height) * (chart.showLabels ? 0.32 : 0.44));
    const ceiling = span;
    const point = (index, value) => {
      const angle = index / rows.length * Math.PI * 2 - Math.PI / 2;
      return { x: Math.cos(angle) * radius * value, y: Math.sin(angle) * radius * value };
    };
    ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 900);
    for (let ring = 1; chart.showGrid !== false && ring <= 4; ring++) {
      ctx.beginPath();
      rows.forEach((row, index) => { const p = point(index, ring / 4); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.stroke();
      if (chart.showValues) { ctx.fillStyle = chart.textColour; ctx.textAlign = "left"; label(chartValueLabel(Number((min + span * ring / 4).toFixed(2)), chart.valueFormat), font * 0.3, -radius * ring / 4, radius); }
    }
    rows.forEach((row, index) => {
      const p = point(index, 1); if (chart.showGrid !== false) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(p.x, p.y); ctx.stroke(); }
      if (chart.showLabels || chart.showValues) {
        const q = point(index, 1.18); ctx.textAlign = Math.abs(q.x) < font ? "center" : q.x < 0 ? "right" : "left";
        ctx.fillStyle = chart.textColour;
        label((chart.showLabels ? row.label : "") + (chart.showValues ? (chart.showLabels ? " " : "") + chartValueLabel(row.value, chart.valueFormat) : ""), q.x, q.y, Math.max(font, (width - radius * 2) / 2));
      }
    });
    ctx.beginPath();
    rows.forEach((row, index) => { const p = point(index, (row.value - min) / ceiling); if (index) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.closePath(); ctx.fillStyle = colour(0) + Math.round((chart.areaOpacity ?? 0.267) * 255).toString(16).padStart(2, "0"); ctx.fill(); ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 300) * (chart.lineWidth ?? 1); ctx.stroke();
    return;
  }
  const horizontal = chart.kind === "bar";
  const labelSpace = chart.showLabels ? (horizontal ? width * 0.25 : font * 2.5) : font;
  const x0 = left + (horizontal ? labelSpace : font * (chart.showAxisValues ? 4 : 2)), x1 = width / 2 - font;
  const y0 = top + font * 1.5, y1 = height / 2 - (horizontal ? chart.showAxisValues ? font * 2.5 : font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const zeroX = x0 + (0 - min) / span * plotWidth;
  const zeroY = y1 - (0 - min) / span * plotHeight;
  if (chart.showGrid) for (let tick = 0; tick <= 4; tick++) {
    const x = x0 + plotWidth * tick / 4, y = y1 - plotHeight * tick / 4;
    ctx.strokeStyle = chart.textColour + "33"; ctx.lineWidth = Math.max(1, width / 900);
    ctx.beginPath(); ctx.moveTo(horizontal ? x : x0, horizontal ? y0 : y); ctx.lineTo(horizontal ? x : x1, horizontal ? y1 : y); ctx.stroke();
  }
  if (chart.showAxisValues) for (let tick = 0; tick <= 4; tick++) {
    const value = min + span * tick / 4, x = x0 + plotWidth * tick / 4, y = y1 - plotHeight * tick / 4;
    ctx.fillStyle = chart.textColour; ctx.textAlign = horizontal ? "center" : "right";
    label(chartValueLabel(Number(value.toPrecision(3)), chart.valueFormat), horizontal ? x : x0 - font / 2, horizontal ? y1 + font * 1.2 : y, horizontal ? plotWidth / 4 * 0.95 : font * 3.5);
  }
  ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 700);
  ctx.beginPath(); ctx.moveTo(horizontal ? zeroX : x0, y0); ctx.lineTo(horizontal ? zeroX : x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  if (chart.kind === "area") {
    ctx.fillStyle = colour(0) + Math.round((chart.areaOpacity ?? 0.267) * 255).toString(16).padStart(2, "0"); ctx.beginPath();
    ctx.moveTo(x0 + 0.5 / rows.length * plotWidth, zeroY);
    traceChartLine(ctx, rows.map((row, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: y1 - (row.value - min) / span * plotHeight })), chart.lineStyle, true);
    ctx.lineTo(x0 + (rows.length - 0.5) / rows.length * plotWidth, zeroY); ctx.closePath(); ctx.fill();
  }
  if (chart.kind === "line" || chart.kind === "area") {
    ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 250) * (chart.lineWidth ?? 1); ctx.beginPath();
    traceChartLine(ctx, rows.map((row, index) => ({ x: x0 + (index + 0.5) / rows.length * plotWidth, y: y1 - (row.value - min) / span * plotHeight })), chart.lineStyle);
    ctx.stroke();
  }
  rows.forEach((row, index) => {
    ctx.fillStyle = colour(index);
    if (horizontal) {
      const slot = plotHeight / rows.length, y = y0 + slot * (index + 0.5), x = x0 + (row.value - min) / span * plotWidth;
      ctx.fillRect(Math.min(zeroX, x), y - slot * (1 - (chart.barGap ?? 0.34)) / 2, Math.abs(x - zeroX), slot * (1 - (chart.barGap ?? 0.34)));
      ctx.fillStyle = chart.textColour; ctx.textAlign = "right";
      if (chart.showLabels) label(row.label, x0 - font * 0.5, y, labelSpace - font);
      if (chart.showValues) label(chartValueLabel(row.value, chart.valueFormat), x1, y - slot * 0.35, plotWidth);
    } else {
      const slot = plotWidth / rows.length, x = x0 + slot * (index + 0.5), y = y1 - (row.value - min) / span * plotHeight;
      if (chart.kind === "column") ctx.fillRect(x - slot * (1 - (chart.barGap ?? 0.34)) / 2, Math.min(zeroY, y), slot * (1 - (chart.barGap ?? 0.34)), Math.abs(y - zeroY));
      else {
        if (chart.kind === "lollipop") { ctx.strokeStyle = colour(index); ctx.lineWidth = Math.max(2, width / 250) * (chart.lineWidth ?? 1); ctx.beginPath(); ctx.moveTo(x, zeroY); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, width / 180) * (chart.pointSize ?? 1), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
      if (chart.showLabels) label(row.label, x, y1 + font * 1.2, slot * 0.95);
      if (chart.showValues) label(chartValueLabel(row.value, chart.valueFormat), x, Math.max(top + font * 0.5, y - font * 0.7), slot);
    }
  });
}`;
