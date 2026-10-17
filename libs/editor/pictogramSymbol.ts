import { VECTOR_SYMBOLS } from "./vectorSymbols";
import type { DataVisualContext } from "./dataVisuals";
export function validPictogramSymbol(value: unknown): boolean { return value === undefined || typeof value === "string" && VECTOR_SYMBOLS.some(symbol => symbol.id === value); }
export function drawPictogramSymbol(ctx: DataVisualContext, id: string, x: number, y: number, size: number, colour: string): void {
  const symbol = VECTOR_SYMBOLS.find(symbol => symbol.id === id);
  if (!symbol) return;
  const previousWidth = ctx.lineWidth, previousCap = ctx.lineCap, previousJoin = ctx.lineJoin;
  ctx.strokeStyle = colour; ctx.lineWidth = Math.max(0.3, size * 0.07); ctx.lineCap = "round"; ctx.lineJoin = "round";
  const X = (value: number) => x + (value / 24 - 0.5) * size, Y = (value: number) => y + (value / 24 - 0.5) * size;
  ctx.beginPath();
  for (const part of symbol.parts) {
    if (part.ellipse) {
      const [cx, cy, rx, ry] = part.ellipse, px = X(cx), py = Y(cy), w = rx / 24 * size, h = ry / 24 * size, k = 0.5522847498307936;
      ctx.moveTo(px + w, py);
      if (ctx.bezierCurveTo) {
        ctx.bezierCurveTo(px + w, py + h * k, px + w * k, py + h, px, py + h); ctx.bezierCurveTo(px - w * k, py + h, px - w, py + h * k, px - w, py); ctx.bezierCurveTo(px - w, py - h * k, px - w * k, py - h, px, py - h); ctx.bezierCurveTo(px + w * k, py - h, px + w, py - h * k, px + w, py);
      } else for (let step = 1; step <= 32; step++) { const angle = step / 32 * Math.PI * 2; ctx.lineTo(px + Math.cos(angle) * w, py + Math.sin(angle) * h); }
      ctx.closePath();
    } else if (part.points?.length) {
      ctx.moveTo(X(part.points[0][0]), Y(part.points[0][1])); for (const point of part.points.slice(1)) ctx.lineTo(X(point[0]), Y(point[1])); if (part.closed) ctx.closePath();
    }
  }
  ctx.stroke(); ctx.lineWidth = previousWidth; ctx.lineCap = previousCap ?? "butt"; ctx.lineJoin = previousJoin ?? "miter";
}
