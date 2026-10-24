import { getPages, pageAt } from "./pages";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot, ShapeClip, Track } from "./types";

/** One background track serves the document; locked page backgrounds are preserved. */
export function applyBackgroundToAllPages(project: ProjectSnapshot, time: number, makeId: () => string) {
  const pages = getPages(project.settings, project.clips), current = pageAt(pages, time), at = Math.max(current.start, Math.min(time, current.end - 1e-6));
  const backgrounds = project.clips.filter(clip => clip.isPageBackground && (clip.kind === "shape" || clip.kind === "image"));
  const lockedPages = new Set(pages.filter(page => backgrounds.some(clip => clip.locked && clip.start < page.end && clip.start + clip.duration > page.start)).map(page => page.index));
  const targets = pages.filter(page => !lockedPages.has(page.index));
  if (!targets.length) return { project, count: 0, skipped: pages.length, id: undefined as string | undefined };
  const hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id)), order = new Map(project.tracks.map((track, index) => [track.id, index]));
  const source = backgrounds.filter(clip => !clip.hidden && !hidden.has(clip.trackId) && at >= clip.start && at < clip.start + clip.duration).sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0))[0];
  const touched = new Set<string>();
  const kept = project.clips.flatMap<Clip>(clip => {
    if (!clip.isPageBackground || clip.locked) return [clip];
    const overlaps = targets.filter(page => clip.start < page.end && clip.start + clip.duration > page.start);
    if (!overlaps.length) return [clip];
    touched.add(clip.trackId);
    const end = clip.start + clip.duration;
    const cuts = Array.from(new Set([clip.start, end, ...overlaps.flatMap(page => [page.start, page.end]).filter(value => value > clip.start && value < end)])).sort((a, b) => a - b);
    const parts: Clip[] = [];
    for (let index = 0; index < cuts.length - 1; index++) {
      const start = cuts[index], finish = cuts[index + 1];
      if (finish - start <= 1e-6 || overlaps.some(page => start >= page.start - 1e-6 && finish <= page.end + 1e-6)) continue;
      parts.push(sliceTimelineClip(clip, start - clip.start, finish - start, parts.length ? makeId() : clip.id, start));
    }
    return parts;
  });
  const used = new Set(kept.map(clip => clip.trackId)), tracks = project.tracks.filter(track => !touched.has(track.id) || used.has(track.id));
  if (tracks.length >= 200 || kept.length + targets.length > 10000) throw new Error("Applying backgrounds would exceed the design’s layer limit");
  const track: Track = { id: makeId(), kind: "video", name: "Page backgrounds", muted: false, hidden: false };
  let currentId: string | undefined = lockedPages.has(current.index) ? source?.id : undefined;
  const copies = targets.map(page => {
    const previous = backgrounds.filter(clip => Math.abs(clip.start - page.start) < 1e-6 && Math.abs(clip.duration - (page.end - page.start)) < 1e-6).sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0))[0];
    const base: Clip = source ?? { id: "", trackId: track.id, kind: "shape", shape: "rect", start: 0, duration: 1, trimIn: 0, w: 1, h: 1, fill: project.settings.background, stroke: null } as ShapeClip;
    const id = makeId(); if (page.index === current.index) currentId = id;
    return { ...base, id, trackId: track.id, groupId: undefined, locked: false, hidden: false, isPageBackground: true, start: page.start, duration: page.end - page.start,
      keyframes: previous?.keyframes, animateIn: previous?.animateIn, animateOut: previous?.animateOut, transitionOut: previous?.transitionOut,
      transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: base.transform?.opacity ?? 1, flipH: base.transform?.flipH, flipV: base.transform?.flipV },
      ...(base.kind === "shape" ? { w: 1, h: 1 } : { fit: "cover" }),
    } as Clip;
  });
  return { project: { ...project, settings: { ...project.settings, pages: pages.map(page => page.start), pageEnd: pages[pages.length - 1].end }, tracks: [track, ...tracks], clips: [...kept, ...copies] }, count: targets.length, skipped: lockedPages.size, id: currentId };
}
