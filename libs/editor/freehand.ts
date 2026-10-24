import type { ShapeClip } from "./types";

export interface PenSettings {
  color: string; width: number; opacity?: number; smoothing?: number;
  cap?: "round" | "butt" | "square"; join?: "round" | "bevel" | "miter"; closed?: boolean; dash?: number[];
}
export const DEFAULT_PEN: PenSettings = { color: "#ffffff", width: 10, opacity: 1, smoothing: 1, cap: "round", join: "round", closed: false, dash: [] };
export const PEN_PRESETS = [
  { id: "pen", label: "Pen", style: { width: 10, opacity: 1, smoothing: 1, cap: "round", join: "round", dash: [], closed: false } },
  { id: "fine", label: "Fine pen", style: { width: 3, opacity: 1, smoothing: 0.8, cap: "round", join: "round", dash: [], closed: false } },
  { id: "marker", label: "Marker", style: { width: 28, opacity: 0.85, smoothing: 0.6, cap: "square", join: "round", dash: [], closed: false } },
  { id: "highlighter", label: "Highlighter", style: { width: 40, opacity: 0.35, smoothing: 1, cap: "butt", join: "round", dash: [], closed: false } },
  { id: "dashed", label: "Dashed pen", style: { width: 8, opacity: 1, smoothing: 1, cap: "round", join: "round", dash: [18, 14], closed: false } },
] as const;

export function sampleStroke(points: [number, number][]): [number, number][] {
  const count = Math.min(8192, points.length);
  return Array.from({ length: count }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, count - 1))]).filter(point => point && point.length === 2 && point.every(Number.isFinite));
}

export function penShapeStyle(pen: PenSettings, opacity?: number, dashOffset?: number): Pick<ShapeClip, "stroke" | "pathSmoothing" | "strokeCap" | "strokeJoin" | "closedPath"> {
  return { stroke: { ...(dashOffset !== undefined ? { dashOffset } : {}), ...(opacity !== undefined ? { opacity } : {}), color: pen.color, width: pen.width, dash: pen.dash ? [...pen.dash] : undefined }, pathSmoothing: pen.smoothing ?? 1, strokeCap: pen.cap ?? "round", strokeJoin: pen.join ?? "round", closedPath: !!pen.closed };
}

type StrokeCommand = ["M" | "L", number, number] | ["Q", number, number, number, number] | ["Z"];

export function freehandCommands(points: [number, number][], width: number, height: number, smoothing = 1, closed = false): StrokeCommand[] {
  const p = sampleStroke(points), commands: StrokeCommand[] = [];
  if (!p.length) return commands;
  const amount = Math.max(0, Math.min(1, smoothing)) / 2, x = (index: number) => p[index][0] * width, y = (index: number) => p[index][1] * height;
  if (p.length === 1) return [["M", x(0), y(0)], ["L", x(0) + 0.01, y(0)]];
  if (closed) {
    const last = p.length - 1;
    commands.push(["M", x(last) * (1 - amount) + x(0) * amount, y(last) * (1 - amount) + y(0) * amount]);
    for (let index = 0; index < p.length; index++) { const next = (index + 1) % p.length; commands.push(["Q", x(index), y(index), x(index) * (1 - amount) + x(next) * amount, y(index) * (1 - amount) + y(next) * amount]); }
    commands.push(["Z"]);
  } else {
    commands.push(["M", x(0), y(0)]);
    for (let index = 1; index < p.length - 1; index++) commands.push(["Q", x(index), y(index), x(index) * (1 - amount) + x(index + 1) * amount, y(index) * (1 - amount) + y(index + 1) * amount]);
    commands.push(["L", x(p.length - 1), y(p.length - 1)]);
  }
  return commands;
}

interface StrokeContext {
  beginPath(): void; closePath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
}

export function freehandPath(ctx: StrokeContext, width: number, height: number, points: [number, number][], smoothing = 1, closed = false): void {
  ctx.beginPath();
  for (const command of freehandCommands(points, width, height, smoothing, closed)) {
    if (command[0] === "M") ctx.moveTo(command[1], command[2]);
    else if (command[0] === "L") ctx.lineTo(command[1], command[2]);
    else if (command[0] === "Q") ctx.quadraticCurveTo(command[1], command[2], command[3], command[4]);
    else ctx.closePath();
  }
}

export function freehandSvg(points: [number, number][], width = 1, height = 1, smoothing = 1, closed = false): string {
  return freehandCommands(points, width, height, smoothing, closed).map(command => command.join(" ")).join(" ");
}
