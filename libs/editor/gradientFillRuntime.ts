/** Gradient fill drawing shared with the web compositor. */
export const GRADIENT_FILL_RUNTIME = String.raw`function createGradientFill(ctx, width, height, fill) {
  if (!fill || !Array.isArray(fill.stops) || fill.stops.length < 2 || fill.stops.length > 8 ||
    fill.stops.some(stop => !stop || !Number.isFinite(stop.offset) || stop.offset < 0 || stop.offset > 1 || !/^#[0-9a-f]{6}$/i.test(stop.colour))) return null;
  const angle = (Number.isFinite(fill.angle) ? fill.angle : 0) * Math.PI / 180;
  const x = Math.cos(angle), y = Math.sin(angle), length = Math.abs(width * x) + Math.abs(height * y);
  const paint = fill.type === "radial" ? ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, Math.hypot(width, height) / 2))
    : ctx.createLinearGradient(-x * length / 2, -y * length / 2, x * length / 2, y * length / 2);
  fill.stops.slice().sort((a, b) => a.offset - b.offset).forEach(stop => paint.addColorStop(stop.offset, stop.colour));
  return paint;
}`;
