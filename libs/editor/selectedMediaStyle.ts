import { normalisePhotoLook } from "./photoLooks";
import { scaledFilterEffects } from "./filterStrength";
import { groupedSelection } from "./designGroups";
import { MEDIA_FRAMES, type MediaFrame } from "./mediaFrames";
import type { Clip, ClipEffects, MediaClip, ProjectSnapshot } from "./types";
export type SelectedMediaStyle = { kind: "look"; effects: ClipEffects } | { kind: "filter"; id: string; strength: number } | { kind: "radius"; value: number } | { kind: "frame"; value: MediaFrame } | { kind: "border"; colour: string; width: number; opacity: number } | { kind: "no-border" };
export function selectedDesignMedia(project: ProjectSnapshot, ids: readonly string[], time: number): MediaClip[] {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return project.clips.filter((clip): clip is MediaClip => (clip.kind === "image" || clip.kind === "video") && chosen.has(clip.id) && !clip.isPageBackground && !clip.hidden && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
}
export function applySelectedMediaStyle(project: ProjectSnapshot, ids: readonly string[], time: number, operation: SelectedMediaStyle) {
  const selected = selectedDesignMedia(project, ids, time), targets = operation.kind === "radius" ? selected.filter(clip => !clip.frame || clip.frame === "rect") : selected;
  if (!targets.length) throw new Error(operation.kind === "radius" ? "Select rectangular photos or videos to round their corners" : "Select photos or videos on the current page");
  if (targets.length > 100) throw new Error("Style up to 100 media layers at a time");
  if (targets.some(clip => clip.locked)) throw new Error("Unlock selected media layers before styling them");
  if (operation.kind === "radius" && (!Number.isFinite(operation.value) || operation.value < 0 || operation.value > 540)) throw new Error("Use a corner radius from 0 to 540");
  if (operation.kind === "frame" && !MEDIA_FRAMES.includes(operation.value)) throw new Error("Choose an available media frame");
  if (operation.kind === "border" && (!/^#[a-f0-9]{6}$/i.test(operation.colour) || !Number.isFinite(operation.width) || operation.width < 0.1 || operation.width > 80 || !Number.isFinite(operation.opacity) || operation.opacity < 0 || operation.opacity > 1)) throw new Error("Choose a six-digit border colour, width from 0.1 to 80, and opacity from 0 to 100 percent");
  if (operation.kind === "filter" && (!Number.isFinite(operation.strength) || operation.strength < 0 || operation.strength > 1)) throw new Error("Use filter strength from 0 to 100 percent");
  const filterEffects = operation.kind === "look" ? normalisePhotoLook(operation.effects) : operation.kind === "filter" ? scaledFilterEffects(operation.id, operation.strength) : undefined;
  const chosen = new Set(targets.map(clip => clip.id));
  const clips = project.clips.map((clip): Clip => {
    if ((clip.kind !== "image" && clip.kind !== "video") || !chosen.has(clip.id)) return clip;
    if (operation.kind === "filter" || operation.kind === "look") return { ...clip, effects: { ...filterEffects } };
    if (operation.kind === "radius") return { ...clip, radius: operation.value };
    if (operation.kind === "frame") return { ...clip, frame: operation.value };
    if (operation.kind === "border") return { ...clip, border: { ...clip.border, color: operation.colour, width: operation.width, opacity: operation.opacity } };
    return { ...clip, border: null };
  });
  return { project: { ...project, clips }, count: targets.length };
}
