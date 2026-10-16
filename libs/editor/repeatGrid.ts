import { translateDesignClip } from "./designClone";
import { groupedSelection, remapDesignGroups } from "./designGroups";
import { getPages, pageAt } from "./pages";
import { sliceTimelineClip } from "./timelineAgent";
import type { DesignLayoutBox } from "./designLayout";
import type { Clip, ProjectSnapshot, Track } from "./types";
export interface RepeatGridOptions { columns: number; rows: number; gapX: number; gapY: number; allowOverflow: boolean; groupCopies?: boolean; stagger?: "none" | "rows" | "columns" }
function repeatGridExtent(project: ProjectSnapshot, ids: readonly string[], time: number, measured: readonly DesignLayoutBox[]) {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const source = project.clips.filter(clip => chosen.has(clip.id) && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
  if (!source.length || source.some(clip => clip.locked || clip.kind === "video" || clip.kind === "audio")) throw new Error("Select unlocked text, shapes, photos, or groups on this page");
  if (source.length > 100) throw new Error("Repeat up to 100 selected layers at a time");
  const boxes = source.map(clip => measured.find(box => box.id === clip.id));
  if (boxes.some(box => !box || ![box.cx, box.cy, box.w, box.h, box.rotation].every(Number.isFinite) || box.w <= 0 || box.h <= 0)) throw new Error("Wait for the selected artwork to appear on the canvas before repeating it");
  const extents = boxes.map(box => { const b = box!, angle = b.rotation * Math.PI / 180, hw = (Math.abs(Math.cos(angle)) * b.w + Math.abs(Math.sin(angle)) * b.h) / 2, hh = (Math.abs(Math.sin(angle)) * b.w + Math.abs(Math.cos(angle)) * b.h) / 2; return { left: b.cx - hw, right: b.cx + hw, top: b.cy - hh, bottom: b.cy + hh }; });
  const left = Math.min(...extents.map(box => box.left)), right = Math.max(...extents.map(box => box.right)), top = Math.min(...extents.map(box => box.top)), bottom = Math.max(...extents.map(box => box.bottom));
  return { source, left, right, top, bottom };
}
export function fitRepeatGridGaps(project: ProjectSnapshot, ids: readonly string[], time: number, measured: readonly DesignLayoutBox[], options: RepeatGridOptions): RepeatGridOptions {
  if (![options.columns, options.rows].every(Number.isInteger) || options.columns < 1 || options.rows < 1 || options.columns * options.rows < 2 || options.columns * options.rows > 100) throw new Error("Choose 2–100 total grid cells");
  if (options.stagger !== undefined && !["none", "rows", "columns"].includes(options.stagger)) throw new Error("Choose a regular or staggered grid");
  const { left, right, top, bottom } = repeatGridExtent(project, ids, time, measured);
  const width = right - left, height = bottom - top, columns = options.columns + (options.stagger === "rows" && options.rows > 1 ? 0.5 : 0), rows = options.rows + (options.stagger === "columns" && options.columns > 1 ? 0.5 : 0);
  const availableX = project.settings.width - left * 2, availableY = project.settings.height - top * 2;
  if (left < 0 || top < 0 || availableX + 0.01 < width * columns || availableY + 0.01 < height * rows) throw new Error("Move or shrink the artwork, or choose fewer cells, to fit this grid within matching page margins");
  const gapX = columns > 1 ? Math.max(0, Math.floor((availableX - width * columns) / (columns - 1) * 100) / 100) : options.gapX;
  const gapY = rows > 1 ? Math.max(0, Math.floor((availableY - height * rows) / (rows - 1) * 100) / 100) : options.gapY;
  if (gapX > 10000 || gapY > 10000) throw new Error("The fitted gap exceeds 10,000 pixels; add more grid cells");
  return { ...options, gapX, gapY };
}
export function repeatDesignGrid(project: ProjectSnapshot, ids: readonly string[], time: number, measured: readonly DesignLayoutBox[], options: RepeatGridOptions, makeId: () => string) {
  if (![options.columns, options.rows].every(Number.isInteger) || options.columns < 1 || options.rows < 1 || options.columns * options.rows < 2 || options.columns * options.rows > 100 || ![options.gapX, options.gapY].every(value => Number.isFinite(value) && value >= 0 && value <= 10000)) throw new Error("Choose 2–100 total grid cells and gaps between 0 and 10,000 pixels");
  if (options.stagger !== undefined && !["none", "rows", "columns"].includes(options.stagger)) throw new Error("Choose a regular grid or stagger alternate rows or columns");
  const { source, left, right, top, bottom } = repeatGridExtent(project, ids, time, measured);
  const stepX = right - left + options.gapX, stepY = bottom - top + options.gapY;
  const offsetX = options.stagger === "rows" && options.rows > 1 ? stepX / 2 : 0, offsetY = options.stagger === "columns" && options.columns > 1 ? stepY / 2 : 0;
  if (!options.allowOverflow && (left < -0.01 || top < -0.01 || right + stepX * (options.columns - 1) + offsetX > project.settings.width + 0.01 || bottom + stepY * (options.rows - 1) + offsetY > project.settings.height + 0.01)) throw new Error("This grid extends beyond the page. Resize or move the selection, use fewer cells, or allow artwork outside the page");
  if (options.groupCopies !== undefined && typeof options.groupCopies !== "boolean") throw new Error("Choose whether copied tiles should be grouped");
  const count = options.rows * options.columns - 1;
  if (project.clips.length + source.length * count > 10000) throw new Error("This grid would exceed the design's layer limit");
  const page = pageAt(getPages(project.settings, project.clips), time), trackIds = new Map<string, string>(), tracks: Track[] = [];
  for (const track of project.tracks) if (source.some(clip => clip.trackId === track.id)) { const id = makeId(); trackIds.set(track.id, id); tracks.push({ ...track, id, name: `${track.name} (grid)`.slice(0, 80), role: undefined }); }
  if (project.tracks.length + tracks.length > 200) throw new Error("This grid would exceed the design's layer limit");
  let budget = JSON.stringify(project).length;
  const clips: Clip[] = [];
  for (let row = 0; row < options.rows; row++) for (let column = 0; column < options.columns; column++) if (row || column) {
    const copies = source.map(clip => {
      const from = Math.max(page.start, clip.start), to = Math.min(page.end, clip.start + clip.duration), trackId = trackIds.get(clip.trackId);
      if (!trackId) throw new Error("A selected layer no longer has a track");
      const part = sliceTimelineClip(clip, from - clip.start, to - from, makeId(), from), copy = translateDesignClip({ ...part, trackId }, (column * stepX + (row % 2 ? offsetX : 0)) / project.settings.width, (row * stepY + (column % 2 ? offsetY : 0)) / project.settings.height);
      budget += JSON.stringify(copy).length; if (budget > 2 * 1024 * 1024) throw new Error("This grid would make the design too large. Choose fewer cells or simpler artwork");
      return copy;
    });
    const tile = remapDesignGroups(copies, makeId), tileGroup = options.groupCopies && tile.length > 1 ? makeId() : null;
    clips.push(...(tileGroup ? tile.map(clip => ({ ...clip, groupId: tileGroup })) : tile));
  }
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, ids: clips.map(clip => clip.id), count };
}
