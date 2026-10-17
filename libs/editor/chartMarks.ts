import type { ChartData, DataVisualContext } from "./dataVisuals";
export type ChartPointShape = "circle" | "square" | "diamond" | "triangle" | "cross";
export type ChartLinePattern = "solid" | "dashed" | "dotted" | "dash-dot";
export const CHART_POINT_SHAPES: readonly ChartPointShape[] = ["circle", "square", "diamond", "triangle", "cross"];
export const CHART_LINE_PATTERNS: readonly ChartLinePattern[] = ["solid", "dashed", "dotted", "dash-dot"];

export function chartSeriesPattern(chart: ChartData, index: number): { marker: ChartPointShape; linePattern: ChartLinePattern } {
  const varied = chart.seriesPatterns && (chart.series?.length ?? 0) > 1;
  return { marker: varied ? CHART_POINT_SHAPES[index % CHART_POINT_SHAPES.length] : chart.pointShape ?? "circle", linePattern: varied ? CHART_LINE_PATTERNS[index % CHART_LINE_PATTERNS.length] : chart.linePattern ?? "solid" };
}

export function strokeChartPattern(ctx: DataVisualContext, pattern: ChartLinePattern = "solid"): void {
  const weight = Math.max(0.5, ctx.lineWidth);
  ctx.setLineDash?.(pattern === "dashed" ? [weight * 4, weight * 2] : pattern === "dotted" ? [weight, weight * 2] : pattern === "dash-dot" ? [weight * 4, weight * 2, weight, weight * 2] : []);
  ctx.stroke(); ctx.setLineDash?.([]);
}

export function drawChartMarker(ctx: DataVisualContext, x: number, y: number, radius: number, shape: ChartPointShape = "circle"): void {
  if (!(radius > 0)) return;
  ctx.beginPath();
  if (shape === "circle") ctx.arc(x, y, radius, 0, Math.PI * 2);
  else if (shape === "square") { const r = radius * 0.9; ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); }
  else if (shape === "diamond") { ctx.moveTo(x, y - radius * 1.2); ctx.lineTo(x + radius * 1.2, y); ctx.lineTo(x, y + radius * 1.2); ctx.lineTo(x - radius * 1.2, y); ctx.closePath(); }
  else if (shape === "triangle") { ctx.moveTo(x, y - radius * 1.3); ctx.lineTo(x + radius * 1.15, y + radius * 0.8); ctx.lineTo(x - radius * 1.15, y + radius * 0.8); ctx.closePath(); }
  else {
    const r = radius * 1.1, d = radius * 0.38;
    ctx.moveTo(x - d, y - r); ctx.lineTo(x + d, y - r); ctx.lineTo(x + d, y - d); ctx.lineTo(x + r, y - d); ctx.lineTo(x + r, y + d); ctx.lineTo(x + d, y + d); ctx.lineTo(x + d, y + r); ctx.lineTo(x - d, y + r); ctx.lineTo(x - d, y + d); ctx.lineTo(x - r, y + d); ctx.lineTo(x - r, y - d); ctx.lineTo(x - d, y - d); ctx.closePath();
  }
  ctx.fill();
}
