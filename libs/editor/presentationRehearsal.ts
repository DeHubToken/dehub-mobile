import { getPages, pageAt, setPageDuration } from "./pages";
import type { RehearsedPageTiming } from "./usePresentationRehearsal";
import type { ProjectSnapshot } from "./types";
export function applyRehearsedPageDurations(project: ProjectSnapshot, entries: readonly RehearsedPageTiming[], time: number, makeId: () => string) {
  const pages = getPages(project.settings, project.clips);
  if (!entries.length || entries.length > 500 || new Set(entries.map(entry => entry.index)).size !== entries.length || entries.some(entry => !Number.isInteger(entry.index) || !pages[entry.index] || !Number.isFinite(entry.seconds) || entry.seconds < 0.1 || entry.seconds > 3600)) throw new Error("Recorded page timings must be from 0.1 to 3,600 seconds per existing page");
  const changed = entries.filter(entry => Math.abs(entry.seconds - (pages[entry.index].end - pages[entry.index].start)) >= 0.001).sort((a, b) => a.index - b.index);
  if (!changed.length) return { project, time, count: 0 };
  if (project.clips.some(clip => clip.locked && clip.start + clip.duration > pages[changed[0].index].start)) throw new Error("Unlock artwork on affected and later pages before applying timings");
  if (pages[pages.length - 1].end + changed.reduce((sum, entry) => sum + entry.seconds - (pages[entry.index].end - pages[entry.index].start), 0) > 86400) throw new Error("These timings would exceed the 24-hour document limit");
  let next = project;
  for (const entry of changed) {
    const result = setPageDuration(next.settings, next.clips, entry.index, entry.seconds, makeId);
    if (!result) throw new Error("Could not apply every recorded page timing");
    next = { ...next, settings: result.settings, clips: result.clips };
    if (next.clips.length > 10000) throw new Error("These timings would exceed the layer limit");
  }
  let bytes = 0; for (const char of JSON.stringify(next)) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  if (bytes > 6 * 1024 * 1024) throw new Error("These timings would make the document too large to save");
  const active = pageAt(pages, time), updated = getPages(next.settings, next.clips)[active.index];
  return { project: next, count: changed.length, time: updated.start + Math.max(0, Math.min(time - active.start, updated.end - updated.start - 0.001)) };
}
