import type { ProjectSnapshot, ShapeClip, Track } from "./types";
import { getPages, pageAt } from "./pages";

export const PHOTO_GRIDS = [
  { id: "columns", label: "Two columns", columns: 2, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  { id: "rows", label: "Two rows", columns: 1, rows: 2, cells: [[0, 0, 1, 1], [0, 1, 1, 1]] },
  { id: "four", label: "Four photos", columns: 2, rows: 2, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  { id: "strip", label: "Three columns", columns: 3, rows: 1, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]] },
  { id: "hero", label: "Feature photo", columns: 3, rows: 2, cells: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1]] },
  { id: "nine", label: "Nine photos", columns: 3, rows: 3, cells: Array.from({ length: 9 }, (_, i) => [i % 3, Math.floor(i / 3), 1, 1]) },
] as const;
export type PhotoGridId = (typeof PHOTO_GRIDS)[number]["id"];

/** Empty frame layers can be filled later without uploading or inventing media. */
export function insertPhotoGrid(project: ProjectSnapshot, time: number, id: PhotoGridId, spacing: number, makeId: () => string) {
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
    const clip: ShapeClip = { id: makeId(), trackId: track.id, kind: "shape", shape: "rect", photoFrame: true, groupId,
      start: page.start, duration: page.end - page.start, trimIn: 0, w: width / W, h: height / H, fill: "#e2e8f0", stroke: null,
      transform: { x: (gap + column * (cw + gap) + width / 2) / W, y: (gap + row * (ch + gap) + height / 2) / H, scale: 1, rotation: 0 } };
    tracks.push(track); clips.push(clip);
  }
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, ids: clips.map(clip => clip.id) };
}
