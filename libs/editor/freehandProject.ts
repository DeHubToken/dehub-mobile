import { penShapeStyle, sampleStroke, type PenSettings } from "./freehand";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot, ShapeClip, Track } from "./types";

/** New ink belongs to the page where the gesture began. */
export function insertFreehandStroke(project: ProjectSnapshot, time: number, points: [number, number][], pen: PenSettings, makeId: () => string) {
  const samples = sampleStroke(points);
  if (!samples.length || !Number.isFinite(pen.width) || pen.width < 1 || pen.width > 100 || !/^#[\da-f]{6}$/i.test(pen.color) || project.tracks.length >= 200 || project.clips.length >= 10000) return null;
  const xs = samples.map(point => point[0]), ys = samples.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 4), height = Math.max(maxY - minY, 4), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const page = pageAt(getPages(project.settings, project.clips), time);
  const track: Track = { id: makeId(), kind: "video", name: "Drawing", muted: false, hidden: false };
  const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "path", fill: null, start: page.start, duration: page.end - page.start, trimIn: 0,
    ...penShapeStyle(pen), w: width / project.settings.width, h: height / project.settings.height,
    points: samples.map(([x, y]) => [(x - cx) / width, (y - cy) / height] as [number, number]),
    transform: { x: cx / project.settings.width, y: cy / project.settings.height, scale: 1, rotation: 0, opacity: Math.max(0, Math.min(1, Number.isFinite(pen.opacity) ? pen.opacity! : 1)) } };
  return { project: { ...project, tracks: [...project.tracks, track], clips: [...project.clips, clip] }, clipId: clip.id };
}
