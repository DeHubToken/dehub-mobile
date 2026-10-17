import { resolvedTextDirection } from "./textDirection";
import { filterChartData } from "./chartRowFilters";
import { drawDataVisual, validDataVisuals, type ChartData, type TableData, type DataVisualContext } from "./dataVisuals";
export type SvgDataVisual = { chart: ChartData } | { table: TableData };
export function dataVisualSvgDocument(value: SvgDataVisual, width: number, height: number, measure: (text: string, font: string) => number): string {
  if (!validDataVisuals(value)) throw new Error("Enter valid chart or table data before exporting");
  return drawDataVisualSvg(value, width, height, measure);
}
export function drawDataVisualSvg(value: SvgDataVisual, width: number, height: number, measure: (text: string, font: string) => number): string {
  if (![width, height].every(value => Number.isFinite(value) && value >= 32 && value <= 8192)) throw new Error("Use graphic dimensions from 32 to 8,192 pixels");
  const parts: string[] = [], path: string[] = [];
  let lineDash: number[] = [];
  let current: [number, number] | null = null, first: [number, number] | null = null;
  const n = (value: number) => String(Number(Number.isFinite(value) ? value.toFixed(4) : 0));
  const xml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const paint = (value: unknown, kind: string) => {
    const colour = typeof value === "string" && /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(value) ? value : "none";
    return `${kind}="${colour.length === 9 ? colour.slice(0, 7) : colour}"` + (colour.length === 9 ? ` ${kind}-opacity="${n(parseInt(colour.slice(7), 16) / 255)}"` : "");
  };
  const stroke = () => (lineDash.length ? `stroke-dasharray="${lineDash.map(n).join(" ")}" ` : "") + paint(context.strokeStyle, "stroke") + ` stroke-width="${n(context.lineWidth)}" stroke-linecap="${context.lineCap === "round" ? "round" : context.lineCap === "square" ? "square" : "butt"}" stroke-linejoin="${context.lineJoin === "round" ? "round" : context.lineJoin === "bevel" ? "bevel" : "miter"}"`;
  const context: DataVisualContext = {
    direction: "ltr", fillStyle: "#000000", strokeStyle: "#000000", font: "500 16px Inter, sans-serif", textAlign: "left", textBaseline: "middle", lineWidth: 1,
    setLineDash(segments: number[]) { lineDash = segments.slice(0, 6).map(value => Math.max(0, Number.isFinite(value) ? value : 0)); },
    beginPath() { path.length = 0; current = null; first = null; },
    closePath() { path.push("Z"); current = first; },
    moveTo(x: number, y: number) { path.push(`M${n(x)} ${n(y)}`); current = [x, y]; first = [x, y]; },
    lineTo(x: number, y: number) { if (!current) context.moveTo(x, y); else { path.push(`L${n(x)} ${n(y)}`); current = [x, y]; } },
    bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) { if (!current) context.moveTo(x1, y1); path.push(`C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`); current = [x, y]; },
    arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise = false) {
      const sx = x + Math.cos(start) * radius, sy = y + Math.sin(start) * radius;
      if (!current) context.moveTo(sx, sy); else if (Math.hypot(current[0] - sx, current[1] - sy) > 0.00001) context.lineTo(sx, sy);
      if (radius <= 0) return;
      const turn = Math.PI * 2; let angle = end - start;
      if (Math.abs(angle) >= turn - 0.0000001) angle = anticlockwise ? -turn : turn;
      else if (anticlockwise && angle > 0) angle -= turn; else if (!anticlockwise && angle < 0) angle += turn;
      const steps = Math.max(1, Math.ceil(Math.abs(angle) / Math.PI));
      for (let index = 1; index <= steps; index++) { const at = start + angle * index / steps, px = x + Math.cos(at) * radius, py = y + Math.sin(at) * radius; path.push(`A${n(radius)} ${n(radius)} 0 0 ${anticlockwise ? 0 : 1} ${n(px)} ${n(py)}`); current = [px, py]; }
    },
    fill() { if (path.length) parts.push(`<path d="${path.join(" ")}" ${paint(context.fillStyle, "fill")}/>`); },
    stroke() { if (path.length) parts.push(`<path d="${path.join(" ")}" fill="none" ${stroke()}/>`); },
    fillRect(x: number, y: number, w: number, h: number) { parts.push(`<rect x="${n(x + Math.min(0, w))}" y="${n(y + Math.min(0, h))}" width="${n(Math.abs(w))}" height="${n(Math.abs(h))}" ${paint(context.fillStyle, "fill")}/>`); },
    strokeRect(x: number, y: number, w: number, h: number) { parts.push(`<rect x="${n(x + Math.min(0, w))}" y="${n(y + Math.min(0, h))}" width="${n(Math.abs(w))}" height="${n(Math.abs(h))}" fill="none" ${stroke()}/>`); },
    measureText(text: string) { const measured = measure(text, context.font); return { width: Number.isFinite(measured) ? Math.max(0, measured) : 0 }; },
    fillTextRotated(text: string, x: number, y: number, degrees: number) {
      const previousDirection = context.direction; context.direction = resolvedTextDirection(text, "auto");
      context.fillText(text, x, y); context.direction = previousDirection;
      parts[parts.length - 1] = parts[parts.length - 1].replace("<text ", `<text transform="rotate(${n(degrees)} ${n(x)} ${n(y)})" `);
    },
    fillText(text: string, x: number, y: number) {
      const size = Number(context.font.match(/([\d.]+)px/)?.[1] ?? 16), weight = context.font.match(/(?:^|\s)([1-9]00)(?:\s|$)/)?.[1] ?? "500", italic = /(?:^|\s)italic(?:\s|$)/.test(context.font);
      const rtl = context.direction === "rtl", anchor = context.textAlign === "center" ? "middle" : context.textAlign === "right" ? rtl ? "start" : "end" : rtl ? "end" : "start", baseline = context.textBaseline === "middle" ? "central" : context.textBaseline === "top" ? "hanging" : context.textBaseline === "bottom" ? "text-after-edge" : "alphabetic";
      parts.push(`<text x="${n(x)}" y="${n(y)}" font-family="${xml(/px\s+(.+)$/.exec(context.font)?.[1] || "Inter, sans-serif")}" font-size="${n(size)}" font-weight="${weight}"${italic ? ' font-style="italic"' : ""} direction="${rtl ? "rtl" : "ltr"}" unicode-bidi="plaintext" text-anchor="${anchor}" dominant-baseline="${baseline}" ${paint(context.fillStyle, "fill")}>${xml(text)}</text>`);
    },
  };
  drawDataVisual(context, width, height, "chart" in value ? value.chart : undefined, "table" in value ? value.table : undefined);
  const graphic = "chart" in value ? value.chart : value.table, renderedChart = "chart" in value ? filterChartData(value.chart) : undefined;
  const fallback = "chart" in value ? value.chart.kind + " chart with " + renderedChart!.rows.length + " displayed categories from " + value.chart.rows.length + " source categories and " + (value.chart.series?.length ?? 1) + " numeric series. " + renderedChart!.rows.slice(0, 5).map(row => row.label).join(", ") : "Table with " + value.table.rows.length + " rows and " + (value.table.rows[0]?.length ?? 0) + " columns. " + (value.table.header ? value.table.rows[0]?.join(", ") : "");
  const description = [graphic.caption, graphic.description || fallback].filter(Boolean).join(". ");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}" height="${n(height)}" viewBox="0 0 ${n(width)} ${n(height)}" xml:space="preserve" role="img" aria-labelledby="graphic-title" aria-describedby="graphic-description"><title id="graphic-title">${xml(graphic.title || ("chart" in value ? "Chart" : "Table"))}</title><desc id="graphic-description">${xml(description)}</desc><g transform="translate(${n(width / 2)} ${n(height / 2)})">${parts.join("")}</g></svg>\n`;
  if (svg.length > 2 * 1024 * 1024) throw new Error("Choose a smaller data graphic for vector export");
  return svg;
}
