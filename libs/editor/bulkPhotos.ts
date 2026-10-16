import { getPages, pageAt } from "./pages";
import { bulkSelectedRows, type BulkRowFilter } from "./bulkRowFilter";
import { replaceDesignMedia, type ReplacementMedia } from "./replaceMedia";
import type { BulkConnections, BulkData } from "./bulkCreate";
import type { Clip, MediaClip, ProjectSnapshot, ShapeClip } from "./types";
export function bulkImageFields(project: ProjectSnapshot, time: number): (MediaClip | ShapeClip)[] {
  const page = pageAt(getPages(project.settings, project.clips), time);
  return project.clips.filter((clip): clip is MediaClip | ShapeClip => (clip.kind === "image" || clip.kind === "shape" && !!clip.photoFrame) && !clip.locked && clip.start < page.end && clip.start + clip.duration > page.start);
}
export function bulkPhotoNames(project: ProjectSnapshot): string[] { return [...new Set(project.clips.filter(clip => clip.kind === "image" && clip.label?.trim()).map(clip => clip.label!.trim()))].sort((a, b) => a.localeCompare(b)); }
export interface BulkPhotoPlan { replacements: Map<string, string>; mediaIds: string[] }
export function planBulkPhotos(project: ProjectSnapshot, time: number, data: BulkData, first: number, last: number, filter: BulkRowFilter, connections: BulkConnections): BulkPhotoPlan {
  const names = new Map<string, Set<string>>();
  for (const clip of project.clips) if (clip.kind === "image" && clip.label?.trim()) { const name = clip.label.trim().toLocaleLowerCase(); if (!names.has(name)) names.set(name, new Set()); names.get(name)!.add(clip.mediaId); }
  const rows = bulkSelectedRows(data, first, last, filter), replacements = new Map<string, string>(), mediaIds = new Set<string>();
  for (const field of bulkImageFields(project, time)) {
    const column = data.headers.indexOf(connections[field.id]); if (column < 0) continue;
    for (const index of rows) {
      const label = (data.rows[index][column] ?? "").trim(); if (!label) continue;
      const sources = names.get(label.toLocaleLowerCase());
      if (!sources?.size) throw new Error(`Row ${index + 1}: no source photo layer is named "${label.slice(0, 80)}"`);
      if (sources.size > 1) throw new Error(`Row ${index + 1}: different photos share the name "${label.slice(0, 80)}". Give source photos unique layer names`);
      const mediaId = [...sources][0]; replacements.set(`${index}:${field.id}`, mediaId); mediaIds.add(mediaId);
      if (field.kind === "image") mediaIds.add(field.mediaId);
    }
  }
  if (mediaIds.size > 200) throw new Error("Use up to 200 distinct source and template photos in one batch");
  return { replacements, mediaIds: [...mediaIds] };
}
export function applyBulkPhoto(project: ProjectSnapshot, copy: Clip, originalId: string, row: number, plan: BulkPhotoPlan, media: ReadonlyMap<string, ReplacementMedia>): Clip {
  const id = plan.replacements.get(`${row}:${originalId}`); if (!id) return copy;
  const source = media.get(id), previous = copy.kind === "image" ? media.get(copy.mediaId) : undefined;
  if (!source || source.kind !== "image" || !source.width || !source.height || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) throw new Error(`Row ${row + 1}: a named source photo is unavailable on this device`);
  if (copy.kind === "image" && [previous?.width, previous?.height].some(value => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) throw new Error(`Row ${row + 1}: the template photo is unavailable on this device`);
  return replaceDesignMedia({ ...project, clips: [copy] }, copy.id, source, previous).clips[0];
}
