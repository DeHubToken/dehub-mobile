import { captureDesignSelection, pasteDesignSelection, removeDesignSelectionFromPage } from "./designClipboard";
import { groupedSelection } from "./designGroups";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot } from "./types";

export function transferDesignSelection(project: ProjectSnapshot, ids: readonly string[], time: number, destinations: readonly number[], move: boolean, makeId: () => string) {
  const pages = getPages(project.settings, project.clips), source = pageAt(pages, time), targets = [...new Set(destinations)].sort((a, b) => a - b);
  if (!targets.length || targets.some(index => !Number.isInteger(index) || !pages[index])) throw new Error("Choose existing destination pages");
  if (targets.includes(source.index)) throw new Error("Choose destination pages outside the current page");
  if (targets.length > 50 || move && targets.length !== 1) throw new Error(move ? "Move layers to one page at a time" : "Copy layers to at most 50 pages at a time");
  const chosen = new Set(groupedSelection(project.clips, ids, time));
  if (project.clips.some(clip => chosen.has(clip.id) && clip.locked && clip.start < source.end && clip.start + clip.duration > source.start)) throw new Error("Unlock the selected layers before transferring them");
  const captured = captureDesignSelection(project, ids, time);
  if (!captured) throw new Error("Select unlocked foreground layers on this page");
  for (const index of targets) {
    const duration = pages[index].end - pages[index].start;
    if (captured.layers.some(layer => !layer.fillPage && layer.offset + layer.clip.duration > duration + 1e-6)) throw new Error(`Extend page ${index + 1} so every selected layer fits before transferring it`);
  }
  let next = move ? removeDesignSelectionFromPage(project, captured.layers.map(layer => layer.clip.id), time, makeId) : project;
  let count = 0;
  for (const index of targets) {
    const page = pages[index], result = pasteDesignSelection(next, page.start + Math.min(0.01, (page.end - page.start) / 2), captured, makeId);
    if (!result || result.skipped) throw new Error("The selected layers do not fit on the destination page");
    next = result.project; count += result.ids.length;
  }
  let bytes = 0;
  for (const char of JSON.stringify(next)) { const point = char.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  if (bytes > 6 * 1024 * 1024) throw new Error("This transfer would make the design too large to save. Copy fewer layers or pages");
  return { project: next, count, pages: targets.length };
}
