import { retargetCopiedPageLinks, remapDesignPageLinks } from "./designLinks";
import { refreshPageNumberClips } from "./pageNumbering";
/**
 * Pages are slices of the timeline. See ProjectSettings.pages.
 */
import type { Clip, ProjectSettings } from "./types";
import { sliceTimelineClip } from "./timelineAgent";
import { remapDesignGroups } from "./designGroups";

/** Shortest a page can be; a new blank page gets this much room. */
export const PAGE_MIN = 5;

export interface Page {
  index: number;
  start: number;
  end: number;
}

export function timelineEnd(clips: Clip[]): number {
  return clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function timelineDuration(settings: ProjectSettings, clips: Clip[]): number {
  const end = timelineEnd(clips);
  const lastStart = settings.pages?.[settings.pages.length - 1] ?? 0;
  if (Number.isFinite(settings.pageEnd) && settings.pageEnd! > lastStart) return Math.max(end, settings.pageEnd!);
  return settings.pages?.length ? Math.max(end, settings.pages[settings.pages.length - 1] + PAGE_MIN) : end;
}

export function getPages(settings: ProjectSettings, clips: Clip[]): Page[] {
  const starts = settings.pages && settings.pages.length ? settings.pages : [0];
  const end = timelineEnd(clips);
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return { index, start, end: next ?? (Number.isFinite(settings.pageEnd) && settings.pageEnd! > start ? Math.max(end, settings.pageEnd!) : Math.max(end, start + PAGE_MIN)) };
  });
}

/** Preview safely inside a page, before its entrance animation has settled. */
export function pagePreviewTime(page: Page): number {
  return page.start + Math.min(0.6, (page.end - page.start) / 2);
}

export function pageAt(pages: Page[], t: number): Page {
  return pages.find((p) => t >= p.start && t < p.end) ?? pages[pages.length - 1];
}

export function appendPage(settings: ProjectSettings, clips: Clip[], time: number, duplicate: boolean, makeId: () => string) {
  const pages = getPages(settings, clips);
  const current = pageAt(pages, time);
  const start = pages[pages.length - 1].end;
  const copies = duplicate ? clips.flatMap(c => {
    const from = Math.max(c.start, current.start), to = Math.min(c.start + c.duration, current.end);
    return to - from >= 0.05 ? [sliceTimelineClip(c, from - c.start, to - from, makeId(), start + from - current.start)] : [];
  }) : clips.filter(c => c.kind === "text" && c.pageNumber && !c.locked && c.start < pages[pages.length - 1].end && c.start + c.duration > pages[pages.length - 1].start).map(c => ({ ...c, id: makeId(), groupId: undefined, start, duration: PAGE_MIN } as Clip));
  return { settings: { ...settings, pages: [...pages.map(p => p.start), start], ...(settings.pageDetails ? { pageDetails: [...pages.map(p => ({ title: "", notes: "", ...settings.pageDetails?.[p.index] })), duplicate ? { ...(settings.pageDetails[current.index] ?? { title: "", notes: "" }) } : { title: "", notes: "" }] } : {}), pageEnd: start + (duplicate ? current.end - current.start : PAGE_MIN) }, clips: refreshPageNumberClips([...clips, ...remapDesignGroups(duplicate ? retargetCopiedPageLinks(copies, new Map([[current.index, pages.length]])) : copies, makeId)], [...pages.map(p => p.start), start]), start };
}

export function removePage(settings: ProjectSettings, clips: Clip[], index: number, makeId: () => string) {
  const pages = getPages(settings, clips);
  const page = pages[index];
  if (!page || pages.length < 2 || clips.some(c => c.locked && c.start + c.duration > page.start)) return null;
  const length = page.end - page.start;
  const kept = clips.flatMap(c => {
    const end = c.start + c.duration;
    if (end <= page.start) return [c];
    if (c.start >= page.end) return [{ ...c, start: c.start - length } as Clip];
    const parts: Clip[] = [];
    const before = page.start - c.start;
    if (before >= 0.05) parts.push(sliceTimelineClip(c, 0, before, c.id));
    const after = end - page.end;
    if (after >= 0.05) parts.push(sliceTimelineClip(c, page.end - c.start, after, parts.length ? makeId() : c.id, page.start));
    return parts;
  });
  const starts = pages.filter(p => p.index !== index).map(p => p.start >= page.end ? p.start - length : p.start);
  return { clips: refreshPageNumberClips(remapDesignPageLinks(kept, pages.filter(p => p.index !== index).map(p => p.index)), starts), settings: { ...settings, pages: starts.length > 1 ? starts : undefined, ...(settings.pageDetails ? { pageDetails: pages.filter(p => p.index !== index).map(p => ({ title: "", notes: "", ...settings.pageDetails?.[p.index] })) } : {}), pageEnd: pages[pages.length - 1].end - length }, start: Math.min(page.start, Math.max(0, pages[pages.length - 1].end - length - 0.01)) };
}

/** Rebuild page slices in the requested order, preserving source trims and clip-local motion. */
export function reorderPage(settings: ProjectSettings, clips: Clip[], from: number, to: number, makeId: () => string) {
  const pages = getPages(settings, clips);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || !pages[from] || !pages[to]) return null;
  const order = [...pages];
  const [moving] = order.splice(from, 1);
  order.splice(to, 0, moving);
  const starts: number[] = [];
  let cursor = 0;
  const destination = new Map<number, number>();
  for (const page of order) {
    starts.push(cursor);
    destination.set(page.index, cursor);
    cursor += page.end - page.start;
  }
  // A locked layer must not be split or moved by an indirect page operation.
  if (clips.some(c => c.locked && pages.some(p => c.start < p.end && c.start + c.duration > p.start &&
    (destination.get(p.index) !== p.start || c.start < p.start || c.start + c.duration > p.end)))) return null;
  const used = new Set<string>();
  const rebuilt: Clip[] = [];
  for (const page of order) {
    const start = destination.get(page.index)!;
    for (const clip of clips) {
      const left = Math.max(clip.start, page.start), right = Math.min(clip.start + clip.duration, page.end);
      if (right - left < 0.05) continue;
      const id = used.has(clip.id) ? makeId() : clip.id;
      used.add(clip.id);
      rebuilt.push(sliceTimelineClip(clip, left - clip.start, right - left, id, start + left - page.start));
    }
  }
  return { clips: refreshPageNumberClips(remapDesignPageLinks(rebuilt, order.map(p => p.index)), starts), settings: { ...settings, pages: starts, ...(settings.pageDetails ? { pageDetails: order.map(p => ({ title: "", notes: "", ...settings.pageDetails?.[p.index] })) } : {}), pageEnd: cursor }, start: destination.get(from)! };
}

/** Resize one page; later pages shift together while video/audio keep their playback rate. */
export function setPageDuration(settings: ProjectSettings, clips: Clip[], index: number, duration: number, makeId: () => string) {
  const pages = getPages(settings, clips), page = pages[index];
  if (!page || !Number.isFinite(duration) || duration < 0.1 || duration > 3600) return null;
  const delta = duration - (page.end - page.start);
  if (Math.abs(delta) < 0.001 || clips.some(c => c.locked && c.start + c.duration > page.start)) return null;
  const output: Clip[] = [];
  for (const clip of clips) {
    const end = clip.start + clip.duration;
    if (end <= page.start) { output.push(clip); continue; }
    if (clip.start >= page.end) { output.push({ ...clip, start: clip.start + delta } as Clip); continue; }
    const left = Math.max(clip.start, page.start), right = Math.min(end, page.end);
    const before = page.start - clip.start;
    if (before >= 0.05) output.push(sliceTimelineClip(clip, 0, before, clip.id));
    const offset = left - page.start;
    const still = clip.kind === "text" || clip.kind === "shape" || clip.kind === "image";
    const reachesEnd = Math.abs(right - page.end) < 0.001;
    const length = Math.min(duration - offset, right - left + (still && reachesEnd ? delta : 0));
    if (length >= 0.05) {
      const part = sliceTimelineClip(clip, left - clip.start, Math.min(length, right - left), before >= 0.05 ? makeId() : clip.id, left);
      // A still layer can hold for longer; source media is never silently slowed or repeated.
      output.push({ ...part, duration: length, transitionOut: undefined } as Clip);
    }
    const after = end - page.end;
    if (after >= 0.05) output.push(sliceTimelineClip(clip, page.end - clip.start, after, makeId(), page.end + delta));
  }
  return { clips: output, settings: { ...settings, pages: pages.map(p => p.index > index ? p.start + delta : p.start), pageEnd: pages[pages.length - 1].end + delta }, start: page.start };
}
