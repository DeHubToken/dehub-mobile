import { mergeEntityValues, type EntityMergeConflict } from "./entityMerge";
import type { ProjectSnapshot } from "./types";

export interface ProjectHistory { current: ProjectSnapshot; past: ProjectSnapshot[]; future: ProjectSnapshot[] }
export interface RebasedProjectHistory extends ProjectHistory { protectedPaths: EntityMergeConflict[] }

function copy(snapshot: ProjectSnapshot): ProjectSnapshot {
  const value = JSON.parse(JSON.stringify(snapshot, (_key, part) => {
    if (typeof part === "number" && !Number.isFinite(part)) throw new Error("Invalid project history value");
    return part;
  })) as ProjectSnapshot;
  if (!value.id || !Array.isArray(value.clips) || !Array.isArray(value.tracks) || !value.settings) throw new Error("Invalid project history");
  const ids = new Set(value.tracks.map(track => track.id));
  if (ids.size !== value.tracks.length || value.tracks.some(track => !track.id)
    || new Set(value.clips.map(clip => clip.id)).size !== value.clips.length
    || value.clips.some(clip => !clip.id || !ids.has(clip.trackId))) throw new Error("Invalid project history references");
  if (value.settings.fps <= 0 || value.settings.width <= 0 || value.settings.height <= 0
    || value.clips.some(clip => clip.duration <= 0 || clip.start < 0 || clip.trimIn < 0
      || ((clip.kind === "video" || clip.kind === "audio") && (clip.speed ?? 1) <= 0))) throw new Error("Invalid project history timing");
  return value;
}

/** Undo changes local work while received edits remain present in every history state. */
export function rebaseProjectHistory(history: ProjectHistory, incoming: ProjectSnapshot): RebasedProjectHistory {
  const current = copy(history.current), received = copy(incoming);
  if (current.id !== received.id || [...history.past, ...history.future].some(snapshot => snapshot.id !== current.id)) throw new Error("Project changed during shared update");
  const withoutTime = (snapshot: ProjectSnapshot) => ({ version: 1, snapshot: { ...snapshot, updatedAt: 0 } });
  const protectedPaths: EntityMergeConflict[] = [];
  function rebase(snapshot: ProjectSnapshot) {
    const result = mergeEntityValues(withoutTime(current), withoutTime(copy(snapshot)), withoutTime(received), true);
    const value = (result.value as { snapshot: ProjectSnapshot }).snapshot;
    const tracks = new Set(value.tracks.map(track => track.id));
    // An older Undo state cannot restore layers into a track deleted by a collaborator.
    value.clips = value.clips.filter(clip => tracks.has(clip.trackId));
    const incomingClips = new Map(received.clips.map(clip => [clip.id, clip]));
    for (const clip of value.clips) {
      if (clip.kind !== "video" && clip.kind !== "audio") continue;
      const source = incomingClips.get(clip.id);
      if (source && (source.kind === "video" || source.kind === "audio") && clip.sourceDuration
        && clip.trimIn + clip.duration * (clip.speed ?? 1) > clip.sourceDuration + 1 / value.settings.fps) {
        clip.trimIn = source.trimIn; clip.duration = source.duration; clip.speed = source.speed;
        clip.mediaId = source.mediaId; clip.sourceDuration = source.sourceDuration;
        result.conflicts.push({ path: ["snapshot", "clips", clip.id], kind: "timing" });
      }
      if (clip.kind === "video" && clip.videoMatte && clip.videoMatte.sourceMediaId !== clip.mediaId) {
        clip.videoMatte = null;
        result.conflicts.push({ path: ["snapshot", "clips", clip.id, "videoMatte"], kind: "references" });
      }
    }
    value.updatedAt = received.updatedAt;
    protectedPaths.push(...result.conflicts);
    return copy(value);
  }
  return { current: received, past: history.past.map(rebase), future: history.future.map(rebase), protectedPaths };
}

/** Local IDs stay local; only validated cloud documents enter the projection step. */
export function mergeLocalProjectEdits(base: ProjectSnapshot, local: ProjectSnapshot, remote: ProjectSnapshot): { snapshot: ProjectSnapshot | null; conflicts: EntityMergeConflict[] } {
  const checked = [base, local, remote].map(copy);
  if (checked.some(snapshot => snapshot.id !== base.id)) throw new Error("Project changed during shared update");
  const wrapped = checked.map(snapshot => ({ version: 1, snapshot: { ...snapshot, updatedAt: 0 } }));
  const result = mergeEntityValues(wrapped[0], wrapped[1], wrapped[2]);
  if (result.conflicts.length) return { snapshot: null, conflicts: result.conflicts };
  const snapshot = (result.value as { snapshot: ProjectSnapshot }).snapshot;
  snapshot.updatedAt = Math.max(local.updatedAt, remote.updatedAt);
  try { copy(snapshot); } catch { return { snapshot: null, conflicts: [{ path: ["snapshot"], kind: "references" }] }; }
  for (const clip of snapshot.clips) if ((clip.kind === "video" || clip.kind === "audio") && clip.sourceDuration
    && clip.trimIn + clip.duration * (clip.speed ?? 1) > clip.sourceDuration + 1 / snapshot.settings.fps)
    result.conflicts.push({ path: ["snapshot", "clips", clip.id], kind: "timing" });
  return { snapshot: result.conflicts.length ? null : snapshot, conflicts: result.conflicts };
}
