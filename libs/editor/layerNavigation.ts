import type { ProjectSnapshot } from "./types";
export function navigableDesignLayers(project: ProjectSnapshot, time: number): string[] {
  const order = new Map(project.tracks.map((track, index) => [track.id, { index, hidden: track.hidden }])), groups = new Set<string>();
  return project.clips.map((clip, index) => ({ clip, index }))
    .filter(({ clip }) => clip.kind !== "audio" && !clip.locked && !clip.hidden && !clip.isPageBackground && !order.get(clip.trackId)?.hidden && time >= clip.start && time < clip.start + clip.duration)
    .sort((a, b) => (order.get(b.clip.trackId)?.index ?? 0) - (order.get(a.clip.trackId)?.index ?? 0) || b.index - a.index)
    .flatMap(({ clip }) => { const key = clip.groupId ? "group:" + clip.groupId : "layer:" + clip.id; if (groups.has(key)) return []; groups.add(key); return [clip.id]; });
}
export function nextDesignLayer(project: ProjectSnapshot, time: number, selected: readonly string[], direction: -1 | 1): string | null {
  const ids = navigableDesignLayers(project, time); if (!ids.length) return null;
  const selectedGroups = new Set(project.clips.filter(clip => selected.includes(clip.id) && clip.groupId).map(clip => clip.groupId));
  const members = new Set(project.clips.filter(clip => selected.includes(clip.id) || clip.groupId && selectedGroups.has(clip.groupId)).map(clip => clip.id));
  const current = ids.findIndex(id => members.has(id));
  return ids[current < 0 ? direction === 1 ? 0 : ids.length - 1 : (current + direction + ids.length) % ids.length];
}
