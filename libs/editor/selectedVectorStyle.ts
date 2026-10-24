import { groupedSelection } from "./designGroups";
import type { Clip, ProjectSnapshot, ShapeClip } from "./types";
export type SelectedVectorStyle = { kind: "fill"; colour: string } | { kind: "outline"; colour: string; width: number } | { kind: "no-fill" | "no-outline" };
export function selectedDesignVectors(project: ProjectSnapshot, ids: readonly string[], time: number): ShapeClip[] {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return project.clips.filter((clip): clip is ShapeClip => clip.kind === "shape" && chosen.has(clip.id) && !clip.chart && !clip.table && !clip.qr && !clip.isPageBackground && !clip.hidden && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
}
export function vectorSupportsFill(clip: ShapeClip): boolean { return !clip.connector && clip.shape !== "line" && clip.shape !== "arrow" && (clip.shape !== "path" || !!clip.closedPath); }
export function applySelectedVectorStyle(project: ProjectSnapshot, ids: readonly string[], time: number, operation: SelectedVectorStyle) {
  const selected = selectedDesignVectors(project, ids, time), fill = operation.kind === "fill" || operation.kind === "no-fill", targets = fill ? selected.filter(vectorSupportsFill) : selected;
  if (!targets.length) throw new Error(fill ? "Select vector artwork with a fill area" : "Select vector artwork on the current page");
  if (targets.length > 100) throw new Error("Style up to 100 vector layers at a time");
  if (targets.some(clip => clip.locked)) throw new Error("Unlock selected vector layers before styling them");
  if ((operation.kind === "fill" || operation.kind === "outline") && !/^#[a-f0-9]{6}$/i.test(operation.colour)) throw new Error("Use a six-digit hex colour");
  if (operation.kind === "outline" && (!Number.isFinite(operation.width) || operation.width < 0.1 || operation.width > 80)) throw new Error("Use an outline width from 0.1 to 80");
  const chosen = new Set(targets.map(clip => clip.id));
  const clips = project.clips.map((clip): Clip => {
    if (clip.kind !== "shape" || !chosen.has(clip.id)) return clip;
    if (operation.kind === "fill") return { ...clip, fill: operation.colour, gradient: null };
    if (operation.kind === "no-fill") return { ...clip, fill: null, gradient: null };
    if (operation.kind === "outline") return { ...clip, ...(!vectorSupportsFill(clip) || clip.symbol && !clip.fill ? { gradient: null } : {}), stroke: { ...clip.stroke, color: operation.colour, width: operation.width } };
    return { ...clip, stroke: vectorSupportsFill(clip) ? null : { ...clip.stroke, color: clip.stroke?.color ?? clip.fill ?? "#ffffff", width: 0 } };
  });
  return { project: { ...project, clips }, count: targets.length };
}
