import { retargetCopiedPageLinks } from "./designLinks";
import { resolveClipAt } from "./keyframes";
import { getPages, pageAt } from "./pages";
import { pageNumberText, validPageNumberFormat, type PageNumberFormat } from "./pageNumbering";
import { groupedSelection, remapDesignGroups } from "./designGroups";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot, TextClip, Track } from "./types";

export type PageNumberPosition = "top-left" | "top-centre" | "top-right" | "bottom-left" | "bottom-centre" | "bottom-right";
export function putPageNumbers(project: ProjectSnapshot, options: { format: PageNumberFormat; position: PageNumberPosition; skipFirst: boolean; colour: string; fontSize: number }, makeId: () => string): ProjectSnapshot {
  if (!validPageNumberFormat(options.format) || !/^(top|bottom)-(left|centre|right)$/.test(options.position) || !/^#[a-f\d]{6}$/i.test(options.colour) || !Number.isFinite(options.fontSize) || options.fontSize < 6 || options.fontSize > 200) throw new Error("Choose valid page number settings");
  if (project.clips.some(clip => clip.kind === "text" && clip.pageNumber && clip.locked)) throw new Error("Unlock existing page numbers before replacing them");
  const pages = getPages(project.settings, project.clips), previous = project.clips.filter(clip => clip.kind === "text" && clip.pageNumber), oldTracks = new Set(previous.map(clip => clip.trackId));
  const kept = project.clips.filter(clip => clip.kind !== "text" || !clip.pageNumber);
  if (kept.length + pages.length > 10000) throw new Error("Page numbers would exceed the design's layer limit");
  const tracks = project.tracks.filter(track => !oldTracks.has(track.id) || kept.some(clip => clip.trackId === track.id));
  if (tracks.length >= 200) throw new Error("Remove an unused layer before adding page numbers");
  const track: Track = { id: makeId(), kind: "text", name: "Page numbers", muted: false, hidden: false };
  const [vertical, horizontal] = options.position.split("-"), x = horizontal === "left" ? 0.05 : horizontal === "right" ? 0.95 : 0.5;
  const numbers: TextClip[] = pages.filter(page => !options.skipFirst || page.index > 0).map(page => ({ kind: "text", id: makeId(), trackId: track.id, label: "Page number", start: page.start, duration: page.end - page.start, trimIn: 0, pageNumber: { ...options.format }, text: pageNumberText(page.index, pages.length, options.format), fontFamily: "'Inter', sans-serif", fontSize: options.fontSize, fontWeight: 400, color: options.colour, x, y: vertical === "top" ? 0.05 : 0.95, align: horizontal as TextClip["align"], maxWidth: 0.8, maxHeight: 0.08, lineHeight: 1 }));
  return { ...project, tracks: numbers.length ? [...tracks, track] : tracks, clips: [...kept, ...numbers] };
}
export function removePageNumbers(project: ProjectSnapshot): ProjectSnapshot {
  const removed = project.clips.filter(clip => clip.kind === "text" && clip.pageNumber && !clip.locked);
  if (!removed.length) return project;
  const ids = new Set(removed.map(clip => clip.id)), tracks = new Set(removed.map(clip => clip.trackId));
  const clips = project.clips.filter(clip => !ids.has(clip.id));
  return { ...project, clips, tracks: project.tracks.filter(track => !tracks.has(track.id) || clips.some(clip => clip.trackId === track.id)) };
}

/** Copy still artwork to matching positions on every other page in one undo step. */
export function repeatPageElements(project: ProjectSnapshot, ids: readonly string[], time: number, makeId: () => string, targetIndexes?: readonly number[]): { project: ProjectSnapshot; count: number } {
  const pages = getPages(project.settings, project.clips), sourcePage = pageAt(pages, time);
  if (targetIndexes && (!targetIndexes.length || targetIndexes.some(index => !Number.isInteger(index) || !pages[index]))) throw new Error("Choose existing destination pages");
  const targets = pages.filter(page => page.index !== sourcePage.index && (!targetIndexes || targetIndexes.includes(page.index)));
  if (!targets.length) throw new Error("Choose at least one destination outside the current page");
  const picked = new Set(groupedSelection(project.clips, ids, time)), hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const source = project.clips.filter(clip => picked.has(clip.id) && (clip.kind === "text" || clip.kind === "shape" || clip.kind === "image") && !clip.locked && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && clip.start < sourcePage.end && clip.start + clip.duration > sourcePage.start);
  if (!source.length) throw new Error("Select a text layer, logo, shape, or photo on this page");
  if (pages.length < 2) throw new Error("Add another page before repeating elements");
  if (source.length > 100 || project.clips.length + source.length * targets.length > 10000) throw new Error("Choose fewer elements or pages to stay within the design's layer limit");
  const trackIds = new Map<string, string>(), tracks: Track[] = [];
  for (const clip of source) if (!trackIds.has(clip.trackId)) {
    const track = project.tracks.find(track => track.id === clip.trackId); if (!track) continue;
    const id = makeId(); trackIds.set(track.id, id); tracks.push({ ...track, id, name: `${track.name} (repeated)`.slice(0, 80), role: undefined });
  }
  if (project.tracks.length + tracks.length > 200) throw new Error("Repeating these elements would exceed the design's layer limit");
  const copies: Clip[] = [];
  let bytes = JSON.stringify(project).length;
  for (const page of targets) {
    const parts = source.flatMap<Clip>(clip => {
      const trackId = trackIds.get(clip.trackId); if (!trackId) return [];
      const from = Math.max(sourcePage.start, clip.start), to = Math.min(sourcePage.end, clip.start + clip.duration);
      const part = sliceTimelineClip(resolveClipAt(clip, time), from - clip.start, to - from, makeId(), page.start);
      const copy = { ...part, trackId, duration: page.end - page.start, keyframes: undefined, animateIn: undefined, animateOut: undefined, transitionOut: undefined, ...(part.kind === "text" ? { pageNumber: undefined } : {}) } as Clip;
      bytes += JSON.stringify(copy).length; if (bytes > 2 * 1024 * 1024) throw new Error("This repeated artwork would make the design too large. Select fewer elements");
      return [copy];
    });
    copies.push(...remapDesignGroups(retargetCopiedPageLinks(parts, new Map([[sourcePage.index, page.index]])), makeId));
  }
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...copies] }, count: targets.length };
}
