export interface GradientFill {
  type: "linear" | "radial";
  angle: number;
  stops: { offset: number; colour: string; opacity?: number }[];
  focus?: { x: number; y: number };
  spread?: number;
}
interface GradientPaint { addColorStop(offset: number, colour: string): void }
interface GradientContext {
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientPaint;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientPaint;
}

export function createGradientFill(ctx: GradientContext, width: number, height: number, fill?: GradientFill | null): GradientPaint | null {
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

export const GRADIENT_PRESETS = [
  { id: "sunset", label: "Sunset", colours: ["#fb7185", "#fb923c", "#fef08a"] },
  { id: "sky", label: "Sky", colours: ["#2563eb", "#22d3ee", "#cffafe"] },
  { id: "mint", label: "Mint", colours: ["#064e3b", "#34d399", "#d1fae5"] },
  { id: "orchid", label: "Orchid", colours: ["#312e81", "#c084fc", "#fbcfe8"] },
  { id: "mono", label: "Monochrome", colours: ["#171717", "#737373", "#fafafa"] },
] as const;

export function gradientFromColours(colours: readonly string[], type: GradientFill["type"] = "linear", angle = 45): GradientFill {
  return { type, angle, stops: colours.map((colour, index) => ({ offset: index / Math.max(1, colours.length - 1), colour })) };
}

export function validGradientFill(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const fill = value as Record<string, unknown>;
  if (fill.focus !== undefined) { const point = fill.focus as Record<string, unknown> | null; if (!point || typeof point !== "object" || Array.isArray(point) || ![point.x, point.y].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)) return false; }
  if (fill.spread !== undefined && (typeof fill.spread !== "number" || !Number.isFinite(fill.spread) || fill.spread < 0.1 || fill.spread > 2)) return false;
  return (fill.type === "linear" || fill.type === "radial") && typeof fill.angle === "number" && Number.isFinite(fill.angle) &&
    Array.isArray(fill.stops) && fill.stops.length >= 2 && fill.stops.length <= 8 && fill.stops.every(stop =>
      stop && typeof stop === "object" && typeof stop.offset === "number" && Number.isFinite(stop.offset) && stop.offset >= 0 && stop.offset <= 1 &&
      typeof stop.colour === "string" && /^#[0-9a-f]{6}$/i.test(stop.colour) && (stop.opacity === undefined || (typeof stop.opacity === "number" && Number.isFinite(stop.opacity) && stop.opacity >= 0 && stop.opacity <= 1)));
}

export function addGradientStop(fill: GradientFill): GradientFill {
  if (!validGradientFill(fill) || fill.stops.length >= 8) return fill;
  const stops = fill.stops.slice().sort((a, b) => a.offset - b.offset);
  let at = 0;
  for (let index = 1; index < stops.length - 1; index++) if (stops[index + 1].offset - stops[index].offset > stops[at + 1].offset - stops[at].offset) at = index;
  const left = stops[at], right = stops[at + 1];
  const colour = "#" + [1, 3, 5].map(index => Math.round((parseInt(left.colour.slice(index, index + 2), 16) + parseInt(right.colour.slice(index, index + 2), 16)) / 2).toString(16).padStart(2, "0")).join("");
  return { ...fill, stops: [...fill.stops, { offset: (left.offset + right.offset) / 2, colour, opacity: ((left.opacity ?? 1) + (right.opacity ?? 1)) / 2 }] };
}
