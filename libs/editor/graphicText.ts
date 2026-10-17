import { resolvedTextDirection } from "./textDirection";
import type { DataVisualContext } from "./dataVisuals";

/** Resolve each label independently while preserving the plot's physical alignment. */
export function drawGraphicText(ctx: DataVisualContext, text: string, x: number, y: number): void {
  ctx.direction = resolvedTextDirection(text);
  ctx.fillText(text, x, y);
}
