import { validGradientFill, type GradientFill } from "./gradientFill";
export function gradientSvgDocument(fill: GradientFill, width: number, height: number): string {
  if (!fill || !validGradientFill(fill)) throw new Error("Complete all gradient colours before downloading");
  if (![width, height].every(value => Number.isFinite(value) && value >= 1 && value <= 16384)) throw new Error("Use page dimensions between 1 and 16,384 pixels");
  const number = (value: number) => String(Math.round(value * 1000000) / 1000000);
  const angle = (fill.angle % 360) * Math.PI / 180, x = Math.cos(angle), y = Math.sin(angle), length = Math.abs(width * x) + Math.abs(height * y);
  const cx = (fill.focus?.x ?? 0.5) * width, cy = (fill.focus?.y ?? 0.5) * height;
  const definition = fill.type === "radial" ? 'radialGradient id="paint" gradientUnits="userSpaceOnUse" cx="' + number(cx) + '" cy="' + number(cy) + '" r="' + number(Math.max(1, Math.hypot(width, height) / 2 * (fill.spread ?? 1))) + '"' : 'linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="' + number(width / 2 - x * length / 2) + '" y1="' + number(height / 2 - y * length / 2) + '" x2="' + number(width / 2 + x * length / 2) + '" y2="' + number(height / 2 + y * length / 2) + '"';
  const stops = fill.stops.slice().sort((a, b) => a.offset - b.offset).map(stop => '<stop offset="' + number(stop.offset) + '" stop-color="' + stop.colour + '" stop-opacity="' + number(stop.opacity ?? 1) + '"/>').join("");
  const tag = fill.type === "radial" ? "radialGradient" : "linearGradient";
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + number(width) + '" height="' + number(height) + '" viewBox="0 0 ' + number(width) + ' ' + number(height) + '"><title>Gradient artwork</title><defs><' + definition + '>' + stops + '</' + tag + '></defs><rect width="100%" height="100%" fill="url(#paint)"/></svg>';
}
