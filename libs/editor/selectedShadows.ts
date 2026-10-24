import { groupedSelection } from "./designGroups";
import type { ClipShadow, ProjectSnapshot } from "./types";
export const SHARED_SHADOW_PRESETS: { id: string; label: string; value: ClipShadow }[] = [
  { id: "soft", label: "Soft drop", value: { color: "#000000", opacity: 0.35, blur: 32, offsetX: 0, offsetY: 16 } },
  { id: "crisp", label: "Crisp", value: { color: "#000000", opacity: 0.5, blur: 0, offsetX: 8, offsetY: 8 } },
  { id: "lifted", label: "Lifted", value: { color: "#000000", opacity: 0.4, blur: 10, offsetX: 0, offsetY: 5 } },
  { id: "glow", label: "Glow", value: { color: "#38bdf8", opacity: 0.75, blur: 36, offsetX: 0, offsetY: 0 } },
];
export function selectedShadowLayers(project: ProjectSnapshot, ids: readonly string[], time: number) {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return project.clips.filter(clip => clip.kind !== "audio" && chosen.has(clip.id) && !clip.isPageBackground && !clip.hidden && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
}
export function applySelectedShadow(project: ProjectSnapshot, ids: readonly string[], time: number, shadow: ClipShadow | null): ProjectSnapshot {
  const selected = selectedShadowLayers(project, ids, time);
  if (!selected.length) throw new Error("Select visible artwork on the current page");
  if (selected.length > 100) throw new Error("Style up to 100 layers at a time");
  if (selected.some(clip => clip.locked)) throw new Error("Unlock selected layers before changing shadows");
  if (shadow && (!/^#[a-f0-9]{6}$/i.test(shadow.color) || !Number.isFinite(shadow.opacity) || shadow.opacity < 0 || shadow.opacity > 1 || !Number.isFinite(shadow.blur) || shadow.blur < 0 || shadow.blur > 120 || !Number.isFinite(shadow.offsetX) || Math.abs(shadow.offsetX) > 300 || !Number.isFinite(shadow.offsetY) || Math.abs(shadow.offsetY) > 300)) throw new Error("Use a six-digit colour, opacity from 0 to 100%, blur from 0 to 120, and offsets from −300 to 300");
  const chosen = new Set(selected.map(clip => clip.id));
  return { ...project, clips: project.clips.map(clip => chosen.has(clip.id) ? { ...clip, shadow: shadow ? { ...shadow } : null } : clip) };
}
