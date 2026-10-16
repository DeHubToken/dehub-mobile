import { retargetCopiedPageLinks, remapDesignPageLinks } from "./designLinks";
import { refreshPageNumberClips } from "./pageNumbering";
import { appendPage, getPages } from "./pages";
import { pageDetails } from "./pageDetails";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot } from "./types";

export type PageManagementAction = "duplicate" | "delete" | "first" | "last";

function serializedSize(value: unknown): number {
  let bytes = 0;
  for (const char of JSON.stringify(value)) { const point = char.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  return bytes;
}

export function designPageOverview(project: ProjectSnapshot) {
  const hidden = new Set(project.tracks.filter(track => track.hidden).map(track => track.id));
  return getPages(project.settings, project.clips).map(page => {
    let headline = "", size = -1, locked = false;
    for (const clip of project.clips) if (clip.start < page.end && clip.start + clip.duration > page.start) {
      locked = locked || !!clip.locked;
      if (clip.kind === "text" && !clip.hidden && !hidden.has(clip.trackId) && clip.fontSize > size && clip.text.trim()) { headline = clip.text.slice(0, 200); size = clip.fontSize; }
    }
    return { ...page, title: pageDetails(project, page.index).title, section: pageDetails(project, page.index).section, presentationHidden: !!pageDetails(project, page.index).presentationHidden, headline, locked };
  });
}

function reorderDesignPages(project: ProjectSnapshot, order: number[], makeId: () => string): ProjectSnapshot {
  const pages = getPages(project.settings, project.clips);
  if (order.length === pages.length && order.every((index, position) => index === position)) return project;
  let cursor = 0;
  const starts: number[] = [], destination = new Map<number, number>();
  for (const index of order) { starts.push(cursor); destination.set(index, cursor); cursor += pages[index].end - pages[index].start; }
  if (project.clips.some(clip => clip.locked && pages.some(page => clip.start < page.end && clip.start + clip.duration > page.start && destination.get(page.index) !== page.start))) throw new Error("Unlock affected layers before deleting or reordering pages");
  const settings = { ...project.settings, pages: starts, pageEnd: cursor, ...(project.settings.pageDetails ? { pageDetails: order.map(index => pageDetails(project, index)) } : {}) };
  let budget = serializedSize({ ...project, clips: [], settings });
  const used = new Set<string>(), clips: Clip[] = [];
  const append = (clip: Clip) => { budget += serializedSize(clip) + 1; if (budget > 6 * 1024 * 1024) throw new Error("This change would make the design too large to save"); clips.push(clip); };
  for (const clip of project.clips) {
    if (clip.locked) { append(clip); continue; }
    for (const index of order) {
      const page = pages[index], start = destination.get(index)!;
      const from = Math.max(clip.start, page.start), to = Math.min(clip.start + clip.duration, page.end);
      if (to - from <= 1e-6) continue;
      const id = used.has(clip.id) ? makeId() : clip.id; used.add(clip.id);
      append(sliceTimelineClip(clip, from - clip.start, to - from, id, start + from - page.start));
    }
  }
  if (clips.length > 10000) throw new Error("This page order would exceed the design’s layer limit");
  return { ...project, clips: refreshPageNumberClips(remapDesignPageLinks(clips, order), starts), settings };
}

export function manageDesignPages(project: ProjectSnapshot, selected: readonly number[], action: PageManagementAction, makeId: () => string) {
  const pages = getPages(project.settings, project.clips), indexes = [...new Set(selected)].sort((a, b) => a - b);
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || !pages[index])) throw new Error("Select one or more pages");
  let next = project, picked: number[] = [];
  if (action === "duplicate") {
    if (pages.length + indexes.length > 500) throw new Error("This batch would exceed the 500-page document limit");
    let budget = serializedSize(project);
    for (const index of indexes) {
      const page = pages[index]; budget += serializedSize(pageDetails(project, index)) + 256;
      for (const clip of project.clips) if (clip.start < page.end && clip.start + clip.duration > page.start) { budget += serializedSize(clip) + 256; if (budget > 6 * 1024 * 1024) throw new Error("This batch is too large to save. Duplicate fewer pages"); }
    }
    for (const index of indexes) {
      const page = appendPage(next.settings, next.clips, pages[index].start + Math.min(0.01, (pages[index].end - pages[index].start) / 2), true, makeId);
      next = { ...next, settings: page.settings, clips: page.clips }; picked.push(pages.length + picked.length);
    }
    const originalIds = new Set(project.clips.map(clip => clip.id)), destinations = new Map(indexes.map((index, offset) => [index, pages.length + offset]));
    const copiedLinks = new Map(retargetCopiedPageLinks(next.clips.filter(clip => !originalIds.has(clip.id)), destinations).map(clip => [clip.id, clip]));
    next = { ...next, clips: next.clips.map(clip => copiedLinks.get(clip.id) ?? clip) };
    next = { ...next, settings: { ...next.settings, pageDetails: [...pages.map(page => pageDetails(project, page.index)), ...indexes.map(index => pageDetails(project, index))] } };
    if (next.clips.length > 10000 || getPages(next.settings, next.clips).slice(-1)[0].end > 86400) throw new Error("This batch exceeds the document’s layer or timeline limit");
    if (serializedSize(next) > 6 * 1024 * 1024) throw new Error("This batch is too large to save. Duplicate fewer pages");
  } else if (action === "delete") {
    if (indexes.length >= pages.length) throw new Error("Keep at least one page in the design");
    const chosen = new Set(indexes);
    next = reorderDesignPages(project, pages.map(page => page.index).filter(index => !chosen.has(index)), makeId);
    picked = [Math.min(indexes[0], pages.length - indexes.length - 1)];
  } else {
    const chosen = new Set(indexes), remaining = pages.map(page => page.index).filter(index => !chosen.has(index));
    const order = action === "first" ? [...indexes, ...remaining] : [...remaining, ...indexes];
    next = reorderDesignPages(project, order, makeId); picked = indexes.map(index => order.indexOf(index));
  }
  const updated = getPages(next.settings, next.clips), page = updated[picked[0]];
  return { project: next, selected: picked, time: page.start + Math.min(0.6, (page.end - page.start) / 2), count: indexes.length };
}

export function moveDesignPagesBefore(project: ProjectSnapshot, selected: readonly number[], target: number, makeId: () => string) {
  const pages = getPages(project.settings, project.clips), indexes = [...new Set(selected)].sort((a, b) => a - b);
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || !pages[index]) || !Number.isInteger(target) || target < 0 || target > pages.length) throw new Error("Choose existing pages and a valid destination");
  const chosen = new Set(indexes);
  if (chosen.has(target)) throw new Error("Choose a destination outside the selected pages");
  const remaining = pages.map(page => page.index).filter(index => !chosen.has(index)), at = target === pages.length ? remaining.length : remaining.indexOf(target);
  const order = [...remaining.slice(0, at), ...indexes, ...remaining.slice(at)], next = reorderDesignPages(project, order, makeId);
  const picked = indexes.map(index => order.indexOf(index)), updated = getPages(next.settings, next.clips), page = updated[picked[0]];
  return { project: next, selected: picked, time: page.start + Math.min(0.6, (page.end - page.start) / 2), count: indexes.length };
}
