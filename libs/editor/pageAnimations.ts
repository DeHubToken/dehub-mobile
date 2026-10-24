import { ANIMATION_PRESETS } from "./animationPresets";
import { groupedSelection } from "./designGroups";
import { getPages, pageAt } from "./pages";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ClipAnimation, ClipAnimationKind, ProjectSnapshot } from "./types";

export type PageAnimationScope = "page" | "all" | "selection";
export type PageAnimationEdge = "in" | "out" | "both";
export interface PageAnimationOptions {
  scope: PageAnimationScope; edge: PageAnimationEdge; kind: ClipAnimationKind | "none"; duration: number;
}

/** Page boundaries isolate motion changes from long layers shared by other pages. */
export function applyPageAnimation(project: ProjectSnapshot, time: number, selectedIds: readonly string[], options: PageAnimationOptions, makeId: () => string): { project: ProjectSnapshot; count: number } {
  if (!Number.isFinite(options.duration) || options.duration < 0.05 || options.duration > 10 || (options.kind !== "none" && !ANIMATION_PRESETS.some(preset => preset.kind === options.kind))) throw new Error("Choose a valid animation and duration between 0.05 and 10 seconds");
  const pages = getPages(project.settings, project.clips), current = pageAt(pages, time);
  const targets = options.scope === "all" ? pages : [current];
  const selected = new Set(groupedSelection(project.clips, selectedIds, time));
  const hiddenTracks = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const edges = options.edge === "both" ? ["animateIn", "animateOut"] as const : [options.edge === "in" ? "animateIn" : "animateOut"] as const;
  let count = 0;
  const clips = project.clips.flatMap<Clip>(clip => {
    if (clip.kind === "audio" || clip.locked || clip.hidden || hiddenTracks.has(clip.trackId) || (options.scope === "selection" && !selected.has(clip.id))) return [clip];
    const overlaps = targets.filter(page => clip.start < page.end && clip.start + clip.duration > page.start);
    if (!overlaps.length || (options.kind === "none" && edges.every(edge => !clip[edge]))) return [clip];
    const end = clip.start + clip.duration;
    const cuts = Array.from(new Set([clip.start, end, ...overlaps.flatMap(page => [page.start, page.end]).filter(value => value > clip.start + 1e-6 && value < end - 1e-6)])).sort((a, b) => a - b);
    return cuts.slice(0, -1).map((start, index) => {
      const finish = cuts[index + 1], full = cuts.length === 2;
      const part = full ? clip : sliceTimelineClip(clip, start - clip.start, finish - start, index === 0 ? clip.id : makeId(), start);
      if (!overlaps.some(page => start >= page.start - 1e-6 && finish <= page.end + 1e-6)) return part;
      const animation: ClipAnimation | undefined = options.kind === "none" ? undefined : {
        kind: options.kind === "typewriter" && clip.kind !== "text" ? "fade" : options.kind,
        duration: Math.min(options.duration, part.duration / 2),
      };
      const same = (before?: ClipAnimation) => before?.kind === animation?.kind && before?.duration === animation?.duration;
      if (edges.every(edge => same(part[edge]))) return part;
      count++;
      const next = { ...part };
      for (const edge of edges) next[edge] = animation;
      return next;
    });
  });
  if (clips.length > 10000) throw new Error("This animation would exceed the design’s layer limit. Apply it to fewer pages");
  return { project: count ? { ...project, clips } : project, count };
}
