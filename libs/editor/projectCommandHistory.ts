import { mergeEntityValues } from "./entityMerge";
import { projectReviewSnapshotKey } from "./cloudProjectReview";
import type { ProjectSnapshot } from "./types";

export interface CommandHistoryAdapter<Entry> {
  read(): { current: ProjectSnapshot; past: Entry[]; future: Entry[] };
  snapshot(entry: Entry): ProjectSnapshot;
  entry(snapshot: ProjectSnapshot): Entry;
  write(history: { past: Entry[]; future: Entry[] }): void;
  isCurrent(): boolean;
  limit?: number;
}
type Change = { before: ProjectSnapshot; after: ProjectSnapshot };
const wrap = (snapshot: ProjectSnapshot) => ({ version: 1, snapshot: { ...snapshot, updatedAt: 0 } });

/** Remove only this command's change, preserving subsequent work on the same fields. */
function reverse(change: Change, current: ProjectSnapshot): ProjectSnapshot {
  const result = mergeEntityValues(wrap(change.after), wrap(change.before), wrap(current), true);
  const next = (result.value as { snapshot: ProjectSnapshot }).snapshot;
  next.updatedAt = current.updatedAt;
  const tracks = new Map(next.tracks.map(track => [track.id, track]));
  const localClips = new Map(current.clips.map(clip => [clip.id, clip]));
  // A new layer used by another edit keeps the track it still needs.
  next.clips = next.clips.filter(clip => {
    if (tracks.has(clip.trackId)) return true;
    const local = localClips.get(clip.id), track = current.tracks.find(item => item.id === clip.trackId);
    if (!local || !track) return false;
    tracks.set(track.id, track); return true;
  });
  next.tracks = [...tracks.values()];
  next.clips = next.clips.map(clip => {
    const local = localClips.get(clip.id);
    if ((clip.kind !== "video" && clip.kind !== "audio") || !local || (local.kind !== "video" && local.kind !== "audio")) return clip;
    const invalidTiming = clip.sourceDuration && clip.trimIn + clip.duration * (clip.speed ?? 1) > clip.sourceDuration + 1 / next.settings.fps;
    const invalidMask = clip.kind === "video" && clip.videoMatte && clip.videoMatte.sourceMediaId !== clip.mediaId;
    if (!invalidTiming && !invalidMask) return clip;
    return { ...clip, mediaId: local.mediaId, sourceDuration: local.sourceDuration, trimIn: local.trimIn, duration: local.duration, speed: local.speed,
      ...(clip.kind === "video" && local.kind === "video" ? { videoMatte: local.videoMatte } : {}) };
  });
  return next;
}

/** Group captured synchronous writes without owning unrelated edits during an await. */
export function projectCommandHistory<Entry>(adapter: CommandHistoryAdapter<Entry>) {
  let marker: Entry | null = null;
  let changes: Change[] = [];
  let depth = 0;
  let cancelled = false;
  const isCurrent = () => {
    if (!adapter.isCurrent() || (!depth && marker !== null && !adapter.read().past.includes(marker))) cancelled = true;
    return !cancelled;
  };
  const withoutChanges = (snapshot: ProjectSnapshot) => changes.reduceRight((value, change) => reverse(change, value), snapshot);
  function capture<Result>(write: () => Result): Result {
    if (!isCurrent()) throw new Error("The pending command changed or was undone");
    if (depth) return write();
    const before = adapter.read(); depth++;
    try { return write(); }
    finally {
      depth--;
      if (adapter.isCurrent()) {
        const after = adapter.read();
        if (projectReviewSnapshotKey(before.current) === projectReviewSnapshotKey(after.current)) {
          adapter.write({ past: before.past, future: before.future });
        } else {
          const index = marker === null ? before.past.length : before.past.indexOf(marker);
          if (index < 0) throw new Error("The pending command changed or was undone");
          const prefix = before.past.slice(0, index);
          const independent = before.past.slice(index + (marker === null ? 0 : 1)).map(entry => adapter.entry(withoutChanges(adapter.snapshot(entry))));
          changes.push({ before: before.current, after: after.current });
          const undo = withoutChanges(after.current);
          const changed = projectReviewSnapshotKey(undo) !== projectReviewSnapshotKey(after.current);
          marker = changed ? adapter.entry(undo) : null;
          const past = [...prefix, ...independent, ...(marker === null ? [] : [marker])].slice(-(adapter.limit ?? 50));
          adapter.write({ past, future: changed ? [] : before.future });
          if (!changed) changes = [];
        }
      }
    }
  }
  return { isCurrent, capture };
}
