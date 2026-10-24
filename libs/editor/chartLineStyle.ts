import type { DataVisualContext } from "./dataVisuals";
export type ChartLineStyle = "straight" | "step" | "smooth";
export function traceChartLine(ctx: DataVisualContext, input: readonly { x: number; y: number }[], style: ChartLineStyle = "straight", connect = false): void {
  const points = input.slice(0, 50); if (!points.length) return;
  if (connect) ctx.lineTo(points[0].x, points[0].y); else ctx.moveTo(points[0].x, points[0].y);
  const clamp = (value: number, a: number, b: number) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index];
    if (style === "step") { const middle = (start.x + end.x) / 2; ctx.lineTo(middle, start.y); ctx.lineTo(middle, end.y); ctx.lineTo(end.x, end.y); }
    else if (style === "smooth" && typeof ctx.bezierCurveTo === "function") {
      const before = points[Math.max(0, index - 2)], after = points[Math.min(points.length - 1, index + 1)];
      const x1 = clamp(start.x + (end.x - before.x) / 6, start.x, end.x), y1 = clamp(start.y + (end.y - before.y) / 6, start.y, end.y);
      const x2 = clamp(end.x - (after.x - start.x) / 6, start.x, end.x), y2 = clamp(end.y - (after.y - start.y) / 6, start.y, end.y);
      ctx.bezierCurveTo(x1, y1, x2, y2, end.x, end.y);
    } else ctx.lineTo(end.x, end.y);
  }
}
