export type ChartAreaMode = "overlay" | "stacked" | "percent" | "stream";
export function stackedAreaBands(input: readonly (readonly number[])[], centred: boolean): { lower: number[]; upper: number[] }[] {
  const sets = input.slice(0, 6), length = Math.min(50, Math.max(0, ...sets.map(set => set.length)));
  const totals = Array.from({ length }, (_, index) => sets.reduce((total, set) => total + Math.max(0, Number.isFinite(set[index]) ? set[index] : 0), 0));
  const baseline = totals.map(total => centred ? -total / 2 : 0);
  return sets.map(set => {
    const lower = [...baseline], upper = lower.map((value, index) => value + Math.max(0, Number.isFinite(set[index]) ? set[index] : 0));
    upper.forEach((value, index) => { baseline[index] = value; });
    return { lower, upper };
  });
}
import { traceChartLine, type ChartLineStyle } from "./chartLineStyle";
import type { DataVisualContext } from "./dataVisuals";

/** Shared easing keeps adjacent smoothed bands ordered between observations. */
export function traceStackedAreaBoundary(ctx: DataVisualContext, input: readonly { x: number; y: number }[], style: ChartLineStyle = "straight", connect = false): void {
  if (style !== "smooth" || !ctx.bezierCurveTo) { traceChartLine(ctx, input, style, connect); return; }
  const points = input.slice(0, 50); if (!points.length) return;
  if (connect) ctx.lineTo(points[0].x, points[0].y); else ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    ctx.bezierCurveTo(start.x + (end.x - start.x) / 3, start.y, end.x - (end.x - start.x) / 3, end.y, end.x, end.y);
  }
}
