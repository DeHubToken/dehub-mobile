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
  if (table && Array.isArray(table.rows)) {
    const rows = table.rows.filter(Array.isArray).slice(0, 20);
    const columns = Math.min(12, Math.max(1, ...rows.map(row => row.length)));
    const cellWidth = width / columns, cellHeight = height / Math.max(1, rows.length);
    ctx.lineWidth = Math.max(1, width / 700);
    rows.forEach((row, r) => {
      for (let c = 0; c < columns; c++) {
        const x = left + c * cellWidth, y = top + r * cellHeight;
        ctx.fillStyle = table.header && r === 0 ? table.headerColour : table.cellColour;
        ctx.fillRect(x, y, cellWidth, cellHeight);
        ctx.strokeStyle = table.borderColour;
        ctx.strokeRect(x, y, cellWidth, cellHeight);
        ctx.fillStyle = table.header && r === 0 ? table.headerTextColour : table.textColour;
        ctx.textAlign = "left";
        label(row[c] || "", x + font * 0.5, y + cellHeight / 2, Math.max(1, cellWidth - font));
      }
    });
    return;
  }
  if (!chart || !Array.isArray(chart.rows)) return;
  const rows = chart.rows.slice(0, 50).filter(row => row && typeof row.label === "string" && Number.isFinite(row.value));
  if (!rows.length) return;
  const colours = Array.isArray(chart.colours) && chart.colours.length ? chart.colours.slice(0, 50) : ["#38bdf8"];
  const colour = (index) => colours[index % colours.length];
  const max = Math.max(0, ...rows.map(row => row.value));
  const min = Math.min(0, ...rows.map(row => row.value));
  const span = max - min || 1;
  if (chart.kind === "pie" || chart.kind === "donut") {
    const positive = rows.filter(row => row.value > 0), sum = positive.reduce((n, row) => n + row.value, 0);
    const legend = chart.showLabels ? Math.min(width * 0.42, 220) : 0;
    const radius = Math.max(1, Math.min((width - legend) * 0.45, height * 0.45));
    const cx = left + (width - legend) / 2;
    let start = -Math.PI / 2;
    positive.forEach((row, index) => {
      const end = start + row.value / sum * Math.PI * 2;
      ctx.fillStyle = colour(index); ctx.beginPath();
      if (chart.kind === "donut") {
        ctx.arc(cx, 0, radius, start, end); ctx.arc(cx, 0, radius * 0.57, end, start, true);
      } else { ctx.moveTo(cx, 0); ctx.arc(cx, 0, radius, start, end); }
      ctx.closePath(); ctx.fill();
      if (chart.showLabels && index < Math.floor(height / (font * 1.7))) {
        const x = left + width - legend + font, y = top + font * (1.3 + index * 1.7);
        ctx.fillStyle = colour(index); ctx.fillRect(x, y - font * 0.35, font * 0.7, font * 0.7);
        ctx.fillStyle = chart.textColour; ctx.textAlign = "left";
        label(row.label + (chart.showValues ? "  " + Number((row.value / sum * 100).toFixed(1)) + "%" : ""), x + font, y, legend - font * 2);
      }
      start = end;
    });
    return;
  }
  const horizontal = chart.kind === "bar";
  const labelSpace = chart.showLabels ? (horizontal ? width * 0.25 : font * 2.5) : font;
  const x0 = left + (horizontal ? labelSpace : font * 2), x1 = width / 2 - font;
  const y0 = top + font * 1.5, y1 = height / 2 - (horizontal ? font : labelSpace);
  const plotWidth = Math.max(1, x1 - x0), plotHeight = Math.max(1, y1 - y0);
  const zeroX = x0 + (0 - min) / span * plotWidth;
  const zeroY = y1 - (0 - min) / span * plotHeight;
  ctx.strokeStyle = chart.textColour; ctx.lineWidth = Math.max(1, width / 700);
  ctx.beginPath(); ctx.moveTo(horizontal ? zeroX : x0, y0); ctx.lineTo(horizontal ? zeroX : x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
  if (chart.kind === "line") {
    ctx.strokeStyle = colour(0); ctx.lineWidth = Math.max(2, width / 250); ctx.beginPath();
    rows.forEach((row, index) => {
      const x = x0 + (index + 0.5) / rows.length * plotWidth, y = y1 - (row.value - min) / span * plotHeight;
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  rows.forEach((row, index) => {
    ctx.fillStyle = colour(index);
    if (horizontal) {
      const slot = plotHeight / rows.length, y = y0 + slot * (index + 0.5), x = x0 + (row.value - min) / span * plotWidth;
      ctx.fillRect(Math.min(zeroX, x), y - slot * 0.33, Math.abs(x - zeroX), slot * 0.66);
      ctx.fillStyle = chart.textColour; ctx.textAlign = "right";
      if (chart.showLabels) label(row.label, x0 - font * 0.5, y, labelSpace - font);
      if (chart.showValues) label(String(row.value), x1, y - slot * 0.35, plotWidth);
    } else {
      const slot = plotWidth / rows.length, x = x0 + slot * (index + 0.5), y = y1 - (row.value - min) / span * plotHeight;
      if (chart.kind === "column") ctx.fillRect(x - slot * 0.33, Math.min(zeroY, y), slot * 0.66, Math.abs(y - zeroY));
      else { ctx.beginPath(); ctx.arc(x, y, Math.max(2, width / 180), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = chart.textColour; ctx.textAlign = "center";
      if (chart.showLabels) label(row.label, x, y1 + font * 1.2, slot * 0.95);
      if (chart.showValues) label(String(row.value), x, Math.max(top + font * 0.5, y - font * 0.7), slot);
    }
  });
}`;
