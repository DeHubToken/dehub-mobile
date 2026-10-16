import type { Clip, ProjectSnapshot } from "./types";

export function groupedSelection(clips: Clip[], ids: readonly string[], time?: number): string[] {
  const chosen = new Set(ids);
  const groups = new Set(clips.filter(clip => chosen.has(clip.id) && clip.groupId).map(clip => clip.groupId!));
  return clips.filter(clip => chosen.has(clip.id) || (clip.kind !== "audio" && clip.groupId && groups.has(clip.groupId) &&
    (time === undefined || (time >= clip.start && time < clip.start + clip.duration)))).map(clip => clip.id);
}

export function groupDesignLayers(project: ProjectSnapshot, ids: readonly string[], makeId: () => string): ProjectSnapshot {
  const backgrounds = new Set(project.clips.filter(clip => clip.isPageBackground).map(clip => clip.id));
  const selected = new Set(groupedSelection(project.clips, ids).filter(id => !backgrounds.has(id)));
  const layers = project.clips.filter(c => selected.has(c.id) && c.kind !== "audio");
  if (layers.length < 2 || layers.some(c => c.locked)) return project;
  const groupId = makeId();
  return { ...project, clips: project.clips.map(clip => selected.has(clip.id) && clip.kind !== "audio" ? { ...clip, groupId } : clip) };
}

export function ungroupDesignLayers(project: ProjectSnapshot, ids: readonly string[]): ProjectSnapshot {
  const chosen = new Set(ids);
  const groups = new Set(project.clips.filter(c => chosen.has(c.id) && c.groupId).map(c => c.groupId!));
  if (!groups.size || project.clips.some(c => c.groupId && groups.has(c.groupId) && c.locked)) return project;
  return { ...project, clips: project.clips.map(clip => clip.groupId && groups.has(clip.groupId) ? { ...clip, groupId: undefined } : clip) };
}

/** Duplicates get their own groups; copying never links new layers back to the originals. */
export function remapDesignGroups(clips: Clip[], makeId: () => string): Clip[] {
  const groups = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const clip of clips) if (clip.groupId) counts.set(clip.groupId, (counts.get(clip.groupId) ?? 0) + 1);
  return clips.map(clip => {
    if (!clip.groupId) return clip;
    if (counts.get(clip.groupId) === 1) return { ...clip, groupId: undefined } as Clip;
    if (!groups.has(clip.groupId)) groups.set(clip.groupId, makeId());
    return { ...clip, groupId: groups.get(clip.groupId)! } as Clip;
  });
}
