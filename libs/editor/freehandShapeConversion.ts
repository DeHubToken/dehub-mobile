import type { ShapeClip } from "./types";
export const DRAWING_SHAPES = ["rect", "ellipse", "triangle", "diamond", "star", "hexagon"] as const;
export type DrawingShape = typeof DRAWING_SHAPES[number];

export function suggestDrawingShape(points: readonly [number, number][], closed: boolean): "rect" | "ellipse" | null {
  if (points.length < 8 || points.some(point => !point.every(Number.isFinite))) return null;
  const sample = Array.from({ length: Math.min(128, points.length) }, (_, index) => points[Math.round(index * (points.length - 1) / Math.max(1, Math.min(128, points.length) - 1))]);
  const left = Math.min(...sample.map(point => point[0])), right = Math.max(...sample.map(point => point[0])), top = Math.min(...sample.map(point => point[1])), bottom = Math.max(...sample.map(point => point[1]));
  if (right - left < 0.001 || bottom - top < 0.001) return null;
  const normalize = (point: [number, number]) => [(point[0] - left) / (right - left) - 0.5, (point[1] - top) / (bottom - top) - 0.5];
  const first = normalize(sample[0]), last = normalize(sample[sample.length - 1]);
  if (!closed && Math.hypot(first[0] - last[0], first[1] - last[1]) > 0.2) return null;
  let rectangle = 0, ellipse = 0;
  const quadrants = new Set<number>();
  for (const point of sample) {
    const [x, y] = normalize(point);
    quadrants.add((x < 0 ? 0 : 1) + (y < 0 ? 0 : 2));
    rectangle += Math.min(Math.abs(Math.abs(x) - 0.5), Math.abs(Math.abs(y) - 0.5)) ** 2;
    ellipse += (Math.abs(Math.hypot(x * 2, y * 2) - 1) / 2) ** 2;
  }
  if (quadrants.size < 4 || Math.sqrt(Math.min(rectangle, ellipse) / sample.length) > 0.075) return null;
  return rectangle < ellipse * 0.8 ? "rect" : "ellipse";
}

export function drawingShapePatch(clip: ShapeClip, target: DrawingShape): Partial<ShapeClip> {
  if (clip.locked || clip.shape !== "path" || !clip.points?.length || !DRAWING_SHAPES.includes(target)) throw new Error("Select an unlocked freehand drawing and a supported shape");
  const open = !clip.closedPath;
  return { shape: target, points: undefined, pathSmoothing: undefined, closedPath: undefined, geometry: undefined, radius: 0,
    fill: open ? null : clip.fill, stroke: clip.stroke ?? (open ? { color: clip.fill ?? "#ffffff", width: 8 } : null) };
}
