import type { ProjectSnapshot } from "./types";
export function designLayerChoices(project: Pick<ProjectSnapshot, "clips" | "tracks">, ids: readonly string[]) {
  const clips = new Map(project.clips.map(clip => [clip.id, clip])), tracks = new Map(project.tracks.map(track => [track.id, track]));
  return [...new Set(ids)].flatMap(id => {
    const clip = clips.get(id);
    if (!clip || clip.locked || clip.hidden || tracks.get(clip.trackId)?.hidden) return [];
    const label = clip.label?.trim() || (clip.kind === "text" ? clip.text.replace(/\s+/g, " ").trim() : "") || tracks.get(clip.trackId)?.name || clip.kind;
    return [{ id, label: label.slice(0, 120), kind: clip.kind, grouped: !!clip.groupId }];
  });
}

export function nextOverlappingLayer(ids: readonly string[], selected: string | null): string | null {
  if (!ids.length) return null;
  const index = selected ? ids.indexOf(selected) : -1;
  return ids[(index + 1) % ids.length];
}
