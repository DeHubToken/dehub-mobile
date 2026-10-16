import { fitDesignClipboardSource } from "./designClipboardFit";
import { groupedSelection, remapDesignGroups } from "./designGroups";
import { getPages, pageAt } from "./pages";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot, Track } from "./types";

export interface DesignClipboard {
  projectId: string;
  canvas?: { width: number; height: number; background: string };
  layers: { clip: Clip; track: Track; offset: number; fillPage: boolean }[];
}
let clipboard: DesignClipboard | null = null;
export type DesignClipboardFeedback = { kind: "copied" | "pasted" | "cut"; count: number; skipped?: number } | { kind: "error"; message: string };
let snapshot: { clipboard: DesignClipboard | null; feedback: DesignClipboardFeedback | null } = { clipboard: null, feedback: null };
const listeners = new Set<() => void>();
export function getDesignClipboard(): DesignClipboard | null { return clipboard; }
export function getDesignClipboardSnapshot() { return snapshot; }
export function reportDesignClipboard(feedback: DesignClipboardFeedback): void { snapshot = { clipboard, feedback }; for (const listener of listeners) listener(); }
export function subscribeDesignClipboard(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Capture a page-relative selection; content and styles are copied together. */
export function captureDesignSelection(project: ProjectSnapshot, ids: readonly string[], time: number): DesignClipboard | null {
  const chosen = new Set(groupedSelection(project.clips, ids, time)), page = pageAt(getPages(project.settings, project.clips), time);
  const hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  const picked = project.clips.filter(clip => chosen.has(clip.id) && clip.kind !== "audio" && !clip.locked && !clip.hidden && !clip.isPageBackground && !hidden.has(clip.trackId) && clip.start < page.end && clip.start + clip.duration > page.start);
  if (!picked.length) return null;
  if (picked.length > 100) throw new Error("Copy up to 100 layers at a time");
  const layers = picked.flatMap(clip => {
    const track = project.tracks.find(track => track.id === clip.trackId);
    if (!track) return [];
    const from = Math.max(clip.start, page.start), to = Math.min(clip.start + clip.duration, page.end);
    return [{ clip: sliceTimelineClip(clip, from - clip.start, to - from, clip.id, 0), track, offset: from - page.start, fillPage: clip.start <= page.start + 1e-6 && clip.start + clip.duration >= page.end - 1e-6 && (clip.kind === "text" || clip.kind === "shape" || clip.kind === "image") }];
  }).sort((a, b) => project.tracks.indexOf(a.track) - project.tracks.indexOf(b.track));
  const json = JSON.stringify({ projectId: project.id, canvas: { width: project.settings.width, height: project.settings.height, background: project.settings.background }, layers });
  if (json.length > 2 * 1024 * 1024) throw new Error("This selection is too large to copy. Choose fewer layers");
  return JSON.parse(json) as DesignClipboard;
}

export function copyDesignSelection(project: ProjectSnapshot, ids: readonly string[], time: number): number {
  const source = captureDesignSelection(project, ids, time);
  if (!source) return 0;
  clipboard = source;
  reportDesignClipboard({ kind: "copied", count: source.layers.length });
  return source.layers.length;
}

export function pasteDesignSelection(project: ProjectSnapshot, time: number, source: DesignClipboard | null, makeId: () => string, options: { preserveProportions?: boolean } = {}): { project: ProjectSnapshot; ids: string[]; skipped: number } | null {
  if (!source?.layers.length) return null;
  if (source.projectId !== project.id && source.layers.some(layer => layer.clip.kind === "image" || layer.clip.kind === "video")) throw new Error("Paste photos and videos within their original design. Text and shapes can be pasted into another design");
  if (options.preserveProportions !== false) source = fitDesignClipboardSource(source, project.settings);
  const page = pageAt(getPages(project.settings, project.clips), time), duration = page.end - page.start;
  const tracks: Track[] = [], copies: Clip[] = [], trackIds = new Map<string, string>();
  let skipped = 0;
  for (const layer of source.layers.slice(0, 100)) {
    const length = layer.fillPage ? duration : Math.min(layer.clip.duration, duration - layer.offset);
    if (length <= 1e-6 || layer.offset >= duration) { skipped++; continue; }
    let trackId = trackIds.get(layer.track.id);
    if (!trackId) { trackId = makeId(); trackIds.set(layer.track.id, trackId); tracks.push({ ...layer.track, id: trackId, hidden: false, role: undefined }); }
    const part = sliceTimelineClip(layer.clip, 0, Math.min(length, layer.clip.duration), makeId(), page.start + layer.offset);
    copies.push({ ...part, duration: length, trackId, locked: false, hidden: false, isPageBackground: undefined, ...(part.kind === "text" ? { pageNumber: undefined } : {}) } as Clip);
  }
  if (!copies.length) throw new Error("The copied layers start after this page ends. Extend the page duration before pasting");
  if (project.tracks.length + tracks.length > 200 || project.clips.length + copies.length > 10000) throw new Error("Pasting would exceed the design’s layer limit");
  const clips = remapDesignGroups(copies, makeId);
  return { project: { ...project, tracks: [...project.tracks, ...tracks], clips: [...project.clips, ...clips] }, ids: clips.map(clip => clip.id), skipped };
}

export function cutDesignSelection(project: ProjectSnapshot, ids: readonly string[], time: number, makeId: () => string): ProjectSnapshot {
  if (!copyDesignSelection(project, ids, time)) return project;
  return removeDesignSelectionFromPage(project, clipboard!.layers.map(layer => layer.clip.id), time, makeId);
}

export function removeDesignSelectionFromPage(project: ProjectSnapshot, ids: readonly string[], time: number, makeId: () => string): ProjectSnapshot {
  const selected = new Set(ids), pages = getPages(project.settings, project.clips), page = pageAt(pages, time);
  const clips = project.clips.flatMap<Clip>(clip => {
    if (!selected.has(clip.id)) return [clip];
    const parts: Clip[] = [], before = page.start - clip.start, after = clip.start + clip.duration - page.end;
    if (before > 1e-6) parts.push(sliceTimelineClip(clip, 0, before, clip.id));
    if (after > 1e-6) parts.push(sliceTimelineClip(clip, page.end - clip.start, after, parts.length ? makeId() : clip.id, page.end));
    return parts;
  });
  const tracks = new Set(clips.map(clip => clip.trackId));
  if (clips.length > 10000) throw new Error("Cutting across these page boundaries would exceed the design’s layer limit");
  return { ...project, settings: { ...project.settings, pages: pages.map(page => page.start), pageEnd: pages[pages.length - 1].end }, clips, tracks: project.tracks.filter(track => tracks.has(track.id) || !project.clips.some(clip => selected.has(clip.id) && clip.trackId === track.id)) };
}
