import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";
import { mediaFrame, type MediaFrame } from "./mediaFrames";

export const PHOTO_GRIDS = [
  { id: "columns", label: "Two columns", columns: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  { id: "rows", label: "Two rows", columns: 1, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1]] },
  { id: "four", label: "Four photos", columns: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  { id: "strip", label: "Three columns", columns: 3, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]] },
  { id: "hero", label: "Feature photo", columns: 3, rows: 2, cells: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1]] },
  { id: "nine", label: "Nine photos", columns: 3, rows: 3, cells: Array.from({ length: 9 }, (_, i) => [i % 3, Math.floor(i / 3), 1, 1]) },
  { id: "three-rows", label: "Three rows", columns: 1, rows: 3, cells: [[0, 0, 1, 1], [0, 1, 1, 1], [0, 2, 1, 1]] },
  { id: "hero-right", label: "Feature right", columns: 3, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1], [1, 0, 2, 2]] },
  { id: "hero-top", label: "Feature above", columns: 2, rows: 3, cells: [[0, 0, 2, 2], [0, 2, 1, 1], [1, 2, 1, 1]] },
  { id: "hero-bottom", label: "Feature below", columns: 2, rows: 3, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 2, 2]] },
  { id: "six-wide", label: "Six photos wide", columns: 3, rows: 2, cells: Array.from({ length: 6 }, (_, i) => [i % 3, Math.floor(i / 3), 1, 1]) },
  { id: "six-tall", label: "Six photos tall", columns: 2, rows: 3, cells: Array.from({ length: 6 }, (_, i) => [i % 2, Math.floor(i / 2), 1, 1]) },
  { id: "magazine", label: "Magazine", columns: 4, rows: 3, cells: [[0, 0, 2, 3], [2, 0, 2, 2], [2, 2, 1, 1], [3, 2, 1, 1]] },
  { id: "mosaic", label: "Mosaic", columns: 3, rows: 3, cells: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1], [0, 2, 1, 1], [1, 2, 2, 1]] },
] as const;
export type PhotoGridId = (typeof PHOTO_GRIDS)[number]["id"];

/** Empty frame layers can be filled later without uploading or inventing media. */
export function insertPhotoGrid(project: ProjectSnapshot, time: number, id: PhotoGridId, spacing: number, makeId: () => string, appearance: { frame?: MediaFrame; radius?: number } = {}) {
  const grid = PHOTO_GRIDS.find(value => value.id === id);
  if (!grid || !Number.isFinite(spacing)) return null;
  const { width: W, height: H } = project.settings;
  const gap = Math.max(0, Math.min(spacing, Math.min(W, H) / 10));
  const cw = (W - gap * 2 - gap * (grid.columns - 1)) / grid.columns, ch = (H - gap * 2 - gap * (grid.rows - 1)) / grid.rows;
  const page = pageAt(getPages(project.settings, project.clips), time), groupId = makeId();
  const tracks: Track[] = [], clips: ShapeClip[] = [];
  for (const [column, row, columns, rows] of grid.cells) {
    const width = cw * columns + gap * (columns - 1), height = ch * rows + gap * (rows - 1);
    const track: Track = { id: makeId(), kind: "video", name: "Photo frame", muted: false, hidden: false };
    const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: mediaFrame(appearance.frame ?? "rect"), radius: Number.isFinite(appearance.radius) ? Math.max(0, Math.min(540, appearance.radius!)) : 0, photoFrame: true, groupId,
      start: page.start, duration: page.end - page.start, trimIn: 0, w: width / W, h: height / H, fill: "#e2e8f0", stroke: null,
      transform: { x: (gap + column * (cw + gap) + width / 2) / W, y: (gap + row * (ch + gap) + height / 2) / H, scale: 1, rotation: 0 } };
    tracks.push(track); clips.push(clip);
  }
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, ids: clips.map(clip => clip.id) };
}
