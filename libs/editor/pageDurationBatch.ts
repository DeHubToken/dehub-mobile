import { getPages, pageAt, setPageDuration } from "./pages";
import type { ProjectSnapshot } from "./types";
export function setDesignPageDurations(project: ProjectSnapshot, indexes: readonly number[], seconds: number, time: number, makeId: () => string) {
  const pages = getPages(project.settings, project.clips), chosen = [...new Set(indexes)].sort((a, b) => a - b);
  if (!chosen.length || chosen.some(index => !Number.isInteger(index) || !pages[index])) throw new Error("Choose existing pages to update");
  if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 3600) throw new Error("Use a page duration from 0.1 to 3,600 seconds");
  const changed = chosen.filter(index => Math.abs(pages[index].end - pages[index].start - seconds) >= 0.001);
  if (!changed.length) return { project, time, count: 0 };
  const first = pages[changed[0]].start;
  if (project.clips.some(clip => clip.locked && clip.start + clip.duration > first)) throw new Error("Unlock layers on the affected page and later pages before changing page timing");
  const duration = pages[pages.length - 1].end + changed.reduce((sum, index) => sum + seconds - (pages[index].end - pages[index].start), 0);
  if (duration > 86400) throw new Error("This timing would exceed the 24-hour document limit");
  let next = project;
  for (const index of changed) {
    const result = setPageDuration(next.settings, next.clips, index, seconds, makeId);
    if (!result) throw new Error("Could not update every selected page");
    next = { ...next, settings: result.settings, clips: result.clips };
    if (next.clips.length > 10000) throw new Error("This timing would exceed the document's layer limit");
  }
  let bytes = 0; for (const char of JSON.stringify(next)) { const value = char.codePointAt(0)!; bytes += value < 128 ? 1 : value < 2048 ? 2 : value < 65536 ? 3 : 4; }
  if (bytes > 6 * 1024 * 1024) throw new Error("This timing would make the design too large to save");
  const active = pageAt(pages, time), updated = getPages(next.settings, next.clips)[active.index];
  return { project: next, count: changed.length, time: updated.start + Math.max(0, Math.min(time - active.start, updated.end - updated.start - 0.001)) };
}
