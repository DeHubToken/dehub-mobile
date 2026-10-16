export type ChartKind = "column" | "bar" | "line" | "pie" | "donut";
export interface ChartData {
  kind: ChartKind;
  rows: { label: string; value: number }[];
  colours: string[];
  textColour: string;
  showLabels: boolean;
  showValues: boolean;
}
export interface TableData {
  rows: string[][];
  header: boolean;
  headerColour: string;
  headerTextColour: string;
  cellColour: string;
  textColour: string;
  borderColour: string;
}
interface DataVisualContext {
  fillStyle: unknown; strokeStyle: unknown; font: string; textAlign: string; textBaseline: string; lineWidth: number;
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise?: boolean): void;
  fill(): void; stroke(): void; fillRect(x: number, y: number, width: number, height: number): void;
  strokeRect(x: number, y: number, width: number, height: number): void;
  measureText(text: string): { width: number }; fillText(text: string, x: number, y: number): void;
}

/** Data is bounded before rendering so imported projects cannot create an unbounded draw loop. */
export function drawDataVisual(ctx: DataVisualContext, width: number, height: number, chart?: ChartData, table?: TableData): void {
  const left = -width / 2, top = -height / 2;
  const font = Math.max(8, Math.min(24, height / 18, width / 28));
  ctx.font = "500 " + font + "px Inter, sans-serif";
  ctx.textBaseline = "middle";
  function label(text: string, x: number, y: number, max: number) {
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
  const colour = (index: number) => colours[index % colours.length];
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
}

export function parseChartData(text: string): ChartData["rows"] {
  return text.split(/\r?\n/).filter(line => line.trim()).slice(0, 50).map(line => {
    const split = Math.max(line.lastIndexOf("\t"), line.lastIndexOf(","));
    if (split < 1) throw new Error("Use one label,value pair per line");
    const label = line.slice(0, split).trim().slice(0, 200), value = Number(line.slice(split + 1).trim());
    if (!label || !Number.isFinite(value)) throw new Error("Each chart row needs a label and a number");
    return { label, value };
  });
}

export function parseTableData(text: string): string[][] {
  return text.split(/\r?\n/).filter(line => line.trim()).slice(0, 20).map(line => line.split(line.includes("\t") ? "\t" : ",").slice(0, 12).map(cell => cell.trim().slice(0, 200)));
}

export function validDataVisuals(value: { chart?: unknown; table?: unknown }): boolean {
  const object = (part: unknown): part is Record<string, unknown> => !!part && typeof part === "object" && !Array.isArray(part);
  const colour = (part: unknown) => typeof part === "string" && /^#[0-9a-f]{6}$/i.test(part);
  if (value.chart !== undefined) {
    const chart = value.chart;
    if (value.table !== undefined || !object(chart) || !["column", "bar", "line", "pie", "donut"].includes(String(chart.kind)) ||
      !Array.isArray(chart.rows) || !chart.rows.length || chart.rows.length > 50 || !Array.isArray(chart.colours) ||
      !chart.colours.length || chart.colours.length > 50 || !chart.colours.every(colour) || !colour(chart.textColour) ||
      typeof chart.showLabels !== "boolean" || typeof chart.showValues !== "boolean" ||
      chart.rows.some(row => !object(row) || typeof row.label !== "string" || row.label.length > 200 || typeof row.value !== "number" || !Number.isFinite(row.value) || Math.abs(row.value) > 1e12)) return false;
  }
  if (value.table !== undefined) {
    const table = value.table;
    if (!object(table) || !Array.isArray(table.rows) || !table.rows.length || table.rows.length > 20 ||
      table.rows.some(row => !Array.isArray(row) || !row.length || row.length > 12 || row.some(cell => typeof cell !== "string" || cell.length > 200)) ||
      typeof table.header !== "boolean" || ![table.headerColour, table.headerTextColour, table.cellColour, table.textColour, table.borderColour].every(colour)) return false;
  }
  return true;
}
