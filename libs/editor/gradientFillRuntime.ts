export const GRADIENT_FILL_RUNTIME = String.raw`function createGradientFill(ctx, width, height, fill) {
  if (!fill || !Array.isArray(fill.stops) || fill.stops.length < 2 || fill.stops.length > 8 ||
    fill.stops.some(stop => !stop || !Number.isFinite(stop.offset) || stop.offset < 0 || stop.offset > 1 || !/^#[0-9a-f]{6}$/i.test(stop.colour))) return null;
  const angle = (Number.isFinite(fill.angle) ? fill.angle : 0) * Math.PI / 180;
  const x = Math.cos(angle), y = Math.sin(angle), length = Math.abs(width * x) + Math.abs(height * y);
  const cx = (Math.max(0, Math.min(1, fill.focus?.x ?? 0.5)) - 0.5) * width, cy = (Math.max(0, Math.min(1, fill.focus?.y ?? 0.5)) - 0.5) * height;
  const paint = fill.type === "radial" ? ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, Math.hypot(width, height) / 2 * Math.max(0.1, Math.min(2, fill.spread ?? 1))))
    : ctx.createLinearGradient(-x * length / 2, -y * length / 2, x * length / 2, y * length / 2);
  fill.stops.slice().sort((a, b) => a.offset - b.offset).forEach(stop => {
    const opacity = Math.max(0, Math.min(1, stop.opacity ?? 1));
    const colour = "rgba(" + parseInt(stop.colour.slice(1, 3), 16) + "," + parseInt(stop.colour.slice(3, 5), 16) + "," + parseInt(stop.colour.slice(5, 7), 16) + "," + opacity + ")";
    paint.addColorStop(stop.offset, colour);
  });
  return paint;
}

`;
