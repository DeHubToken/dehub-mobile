export interface GradientFill {
  type: "linear" | "radial";
  angle: number;
  stops: { offset: number; colour: string }[];
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
  const paint = fill.type === "radial" ? ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(1, Math.hypot(width, height) / 2))
    : ctx.createLinearGradient(-x * length / 2, -y * length / 2, x * length / 2, y * length / 2);
  fill.stops.slice().sort((a, b) => a.offset - b.offset).forEach(stop => paint.addColorStop(stop.offset, stop.colour));
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
  return (fill.type === "linear" || fill.type === "radial") && typeof fill.angle === "number" && Number.isFinite(fill.angle) &&
    Array.isArray(fill.stops) && fill.stops.length >= 2 && fill.stops.length <= 8 && fill.stops.every(stop =>
      stop && typeof stop === "object" && typeof stop.offset === "number" && Number.isFinite(stop.offset) && stop.offset >= 0 && stop.offset <= 1 &&
      typeof stop.colour === "string" && /^#[0-9a-f]{6}$/i.test(stop.colour));
}
