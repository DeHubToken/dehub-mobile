import { groupedSelection } from "./designGroups";
import type { Clip, ProjectSnapshot } from "./types";
export type SimilarSelectionKind = "type" | "colour" | "font";
export function designSelectionKey(clip: Clip, kind: SimilarSelectionKind): string | null {
  if (kind === "type") return clip.kind === "shape" ? clip.chart ? `chart:${clip.chart.kind}` : clip.table ? "table" : clip.qr ? "qr" : clip.symbol ? "symbol" : clip.photoFrame ? "frame" : `shape:${clip.shape}` : clip.kind;
  if (kind === "font") return clip.kind === "text" ? clip.fontFamily.toLowerCase().replace(/[\s'"`]/g, "") : null;
  if (clip.kind === "shape" && (clip.chart || clip.table || clip.qr || clip.photoFrame)) return null;
  if (clip.kind !== "shape" && clip.kind !== "text") return null;
  if (clip.gradient) return JSON.stringify(clip.gradient).toLowerCase();
  const colour = clip.kind === "text" ? clip.color : clip.fill;
  return typeof colour === "string" ? colour.toLowerCase() : null;
}
export function selectablePageLayers(project: ProjectSnapshot, time: number): Clip[] {
  const hiddenTracks = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const active = project.clips.filter(clip => clip.kind !== "audio" && time >= clip.start && time < clip.start + clip.duration);
  const excluded = (clip: Clip) => !!(clip.locked || clip.hidden || clip.isPageBackground || hiddenTracks.has(clip.trackId));
  const excludedGroups = new Set(active.filter(clip => excluded(clip) && clip.groupId).map(clip => clip.groupId));
  return active.filter(clip => !excluded(clip) && (!clip.groupId || !excludedGroups.has(clip.groupId)));
}
export function similarDesignSelection(project: ProjectSnapshot, referenceId: string | null, time: number, kind: SimilarSelectionKind | "all"): string[] {
  const layers = selectablePageLayers(project, time);
  if (kind === "all") return layers.map(clip => clip.id);
  const reference = layers.find(clip => clip.id === referenceId), key = reference ? designSelectionKey(reference, kind) : null;
  if (key === null) return [];
  const allowed = new Set(layers.map(clip => clip.id));
  return groupedSelection(project.clips, layers.filter(clip => designSelectionKey(clip, kind) === key).map(clip => clip.id), time).filter(id => allowed.has(id));
}
