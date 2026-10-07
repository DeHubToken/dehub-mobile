/**
 * Pages are slices of the timeline. See ProjectSettings.pages.
 */
import type { Clip, ProjectSettings } from "./types";
import { sliceTimelineClip } from "./timelineAgent";

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
  return settings.pages?.length ? Math.max(end, settings.pages[settings.pages.length - 1] + PAGE_MIN) : end;
}

export function getPages(settings: ProjectSettings, clips: Clip[]): Page[] {
  const starts = settings.pages && settings.pages.length ? settings.pages : [0];
  const end = timelineEnd(clips);
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return { index, start, end: next ?? Math.max(end, start + PAGE_MIN) };
  });
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
  }) : [];
  return { settings: { ...settings, pages: [...pages.map(p => p.start), start] }, clips: [...clips, ...copies], start };
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
  return { clips: kept, settings: { ...settings, pages: starts.length > 1 ? starts : undefined }, start: Math.min(page.start, timelineDuration({ ...settings, pages: starts }, kept)) };
}
