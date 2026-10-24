export const MEDIA_FRAMES = ["rect", "ellipse", "triangle", "star", "heart", "hexagon", "diamond", "pentagon", "octagon", "parallelogram", "trapezoid"] as const;
import { shapePolygon } from "./shapeGeometry";
export type MediaFrame = typeof MEDIA_FRAMES[number];
export const MEDIA_FRAME_NAMES: Record<MediaFrame, string> = {
  rect: "Rectangle", ellipse: "Oval", triangle: "Triangle", star: "Star", heart: "Heart", hexagon: "Hexagon", diamond: "Diamond", pentagon: "Pentagon", octagon: "Octagon", parallelogram: "Parallelogram", trapezoid: "Trapezoid",
};
export function mediaFrame(value: string): MediaFrame { return MEDIA_FRAMES.includes(value as MediaFrame) ? value as MediaFrame : "rect"; }

/** Small shape silhouettes for frame pickers and layout thumbnails. */
export function mediaFramePreview(frame: MediaFrame): string {
  if (frame === "rect") return "M 0 0 H 100 V 100 H 0 Z";
  if (frame === "ellipse") return "M 50 0 A 50 50 0 1 1 49.99 0 Z";
  if (frame === "triangle") return "M 50 0 L 100 100 H 0 Z";
  if (frame === "heart") return "M 50 94 C 36 78 0 56 0 28 C 0 0 35 -6 50 20 C 65 -6 100 0 100 28 C 100 56 64 78 50 94 Z";
  const points = shapePolygon(frame, 100, 100);
  if (points) return points.map((point, index) => `${index ? "L" : "M"} ${point[0] + 50} ${point[1] + 50}`).join(" ") + " Z";
  const count = frame === "star" ? 10 : 6;
  return Array.from({ length: count }, (_, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / count, radius = frame === "star" && index % 2 ? 22 : 50;
    return `${index ? "L" : "M"} ${50 + Math.cos(angle) * radius} ${50 + Math.sin(angle) * radius}`;
  }).join(" ") + " Z";
}
