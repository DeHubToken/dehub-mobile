import { groupedSelection, remapDesignGroups } from "./designGroups";
import { getPages, pageAt } from "./pages";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot, Track } from "./types";

/** Translate static placement and the entire animated path by the same amount. */
export function translateDesignClip(clip: Clip, dx: number, dy: number): Clip {
  const keys = clip.keyframes ? { ...clip.keyframes, ...(clip.keyframes.x ? { x: clip.keyframes.x.map(key => ({ ...key, v: key.v + dx })) } : {}), ...(clip.keyframes.y ? { y: clip.keyframes.y.map(key => ({ ...key, v: key.v + dy })) } : {}) } : undefined;
  if (clip.kind === "text") return { ...clip, x: clip.x + dx, y: clip.y + dy, keyframes: keys, pageNumber: undefined };
  const transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, ...clip.transform };
  return { ...clip, transform: { ...transform, x: transform.x + dx, y: transform.y + dy }, keyframes: keys };
}
export function duplicateDesignPageSelection(project: ProjectSnapshot, ids: readonly string[], time: number, makeId: () => string): { project: ProjectSnapshot; ids: string[] } | null {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const source = project.clips.filter(clip => chosen.has(clip.id) && clip.kind !== "audio" && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && time >= clip.start && time < clip.start + clip.duration);
  if (!source.length || source.some(clip => clip.locked)) return null;
  if (source.length > 100 || source.length + project.clips.length > 10000) throw new Error("Duplicate up to 100 selected layers without exceeding the document's layer limit");
  const page = pageAt(getPages(project.settings, project.clips), time), tracks: Track[] = [], trackIds = new Map<string, string>();
  for (const track of project.tracks) if (source.some(clip => clip.trackId === track.id)) { const id = makeId(); tracks.push({ ...track, id, hidden: false, role: undefined, name: `${track.name} (copy)`.slice(0, 80) }); trackIds.set(track.id, id); }
  if (tracks.length + project.tracks.length > 200) throw new Error("This copy would exceed the document's layer limit");
  const anchors = source.map(clip => clip.kind === "text" ? { x: clip.x, y: clip.y } : { x: clip.transform?.x ?? 0.5, y: clip.transform?.y ?? 0.5 });
  const dx = 24 / project.settings.width * (anchors.some(point => point.x + 24 / project.settings.width > 0.98) ? -1 : 1), dy = 24 / project.settings.height * (anchors.some(point => point.y + 24 / project.settings.height > 0.98) ? -1 : 1);
  const copies = source.map(clip => {
    const trackId = trackIds.get(clip.trackId); if (!trackId) throw new Error("A selected layer no longer has a track");
    const from = Math.max(page.start, clip.start), to = Math.min(page.end, clip.start + clip.duration);
    return translateDesignClip({ ...sliceTimelineClip(clip, from - clip.start, to - from, makeId(), from), trackId }, dx, dy);
  });
  const clips = remapDesignGroups(copies, makeId), next = { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] };
  if (JSON.stringify(next).length > 2 * 1024 * 1024) throw new Error("This copy would make the design too large. Select fewer layers");
  return { project: next, ids: clips.map(clip => clip.id) };
}
