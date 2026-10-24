import { getPages, pageAt } from "./pages";
import { replaceDesignMedia, type ReplacementMedia } from "./replaceMedia";
import type { MediaClip, ProjectSnapshot } from "./types";

export function designPagePhotos(project: ProjectSnapshot, time: number, groupId?: string) {
  const page = pageAt(getPages(project.settings, project.clips), time), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return project.clips.filter((clip): clip is MediaClip => clip.kind === "image" && !clip.locked && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId)
    && (!groupId || clip.groupId === groupId) && clip.start >= page.start - 1e-6 && clip.start + clip.duration <= page.end + 1e-6);
}

/** Move photo sources between existing frames; the frames retain their placement and appearance. */
export function arrangeDesignPhotos(project: ProjectSnapshot, ids: readonly string[], sourceOrder: readonly number[], metadata: ReadonlyMap<string, ReplacementMedia>): ProjectSnapshot {
  if (ids.length < 2 || ids.length > 100 || new Set(ids).size !== ids.length || sourceOrder.length !== ids.length || new Set(sourceOrder).size !== ids.length || sourceOrder.some(index => !Number.isInteger(index) || index < 0 || index >= ids.length)) throw new Error("Choose 2–100 photo frames to rearrange");
  const slots = ids.map(id => project.clips.find(clip => clip.id === id));
  if (slots.some(clip => !clip || clip.kind !== "image" || clip.locked || clip.hidden || clip.isPageBackground)) throw new Error("Choose unlocked photo frames");
  const photos = slots as MediaClip[];
  if (photos.some(clip => { const source = metadata.get(clip.mediaId); return !source || source.kind !== "image" || ![source.width, source.height].every(value => typeof value === "number" && Number.isFinite(value) && value > 0); })) throw new Error("Wait for the photo dimensions to load before rearranging frames");
  let next = project;
  photos.forEach((slot, index) => {
    const source = photos[sourceOrder[index]];
    if (source.id === slot.id) return;
    next = replaceDesignMedia(next, slot.id, metadata.get(source.mediaId)!, metadata.get(slot.mediaId), true);
    const updated = next.clips.find(clip => clip.id === slot.id) as MediaClip;
    if (!updated.crop) return;
    const original = source.crop ?? { left: 0, right: 0, top: 0, bottom: 0 };
    const width = 1 - updated.crop.left - updated.crop.right, height = 1 - updated.crop.top - updated.crop.bottom;
    const cx = (original.left + 1 - original.right) / 2, cy = (original.top + 1 - original.bottom) / 2;
    const left = Math.max(0, 1 - width - 0.9, Math.min(0.9, 1 - width, cx - width / 2)), top = Math.max(0, 1 - height - 0.9, Math.min(0.9, 1 - height, cy - height / 2));
    next = { ...next, clips: next.clips.map(clip => clip.id === slot.id ? { ...updated, crop: { left, right: Math.max(0, 1 - width - left), top, bottom: Math.max(0, 1 - height - top) } } : clip) };
  });
  return next;
}

export function photoSourceOrder(count: number, action: "rotate" | "shuffle"): number[] {
  const order = Array.from({ length: count }, (_, index) => index);
  if (action === "rotate") return order.map(index => (index + count - 1) % count);
  for (let index = count - 1; index > 0; index--) { const swap = Math.floor(Math.random() * (index + 1)); [order[index], order[swap]] = [order[swap], order[index]]; }
  if (count > 1 && order.every((value, index) => value === index)) [order[0], order[1]] = [order[1], order[0]];
  return order;
}
