export const GRAPHIC_TEXT_RUNTIME = "function drawGraphicText(ctx, text, x, y) {\n  ctx.direction = resolvedTextDirection(text);\n  ctx.fillText(text, x, y);\n}\n";
