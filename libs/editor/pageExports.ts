import { designPageSectionIndexes } from "./pageDetails";
import { namedPageExports } from "./pageFilenamePattern";
import { exportFilename } from "./exportName";
import { getPages, pageAt } from "./pages";
import type { ProjectSnapshot } from "./types";

export type PageExportScope = "all" | "current" | number[];
export interface PageExportFrame { index: number; time: number; filename: string }

/** Read page numbers and inclusive ranges such as 1,3-5 without silently dropping mistakes. */
export function parsePageSelection(value: string, count: number): number[] {
  if (!value.trim() || value.length > 4000) throw new Error("Enter page numbers, for example 1,3-5");
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers and ranges, for example 1,3-5");
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last < first || last > count) throw new Error(`Choose page numbers between 1 and ${count}`);
    for (let index = first - 1; index < last; index++) selected.add(index);
  }
  return [...selected].sort((a, b) => a - b);
}

/** Keep the requested output order, including descending ranges, without repeating pages. */
export function parsePageExportOrder(value: string, count: number): number[] {
  if (!value.trim() || value.length > 4000) throw new Error("Enter page numbers in export order, for example 3,1-2");
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers and ranges, for example 3,1-2 or 5-1");
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last < 1 || first > count || last > count) throw new Error(`Choose page numbers between 1 and ${count}`);
    const step = first <= last ? 1 : -1;
    for (let index = first; ; index += step) { selected.add(index - 1); if (index === last) break; }
  }
  return [...selected];
}

/** Multi-page stills capture page starts; single-page stills retain the playhead. */
export function pageExportFrames(snapshot: ProjectSnapshot, time: number, scope: PageExportScope, format: "png" | "jpg", filenamePattern = ""): PageExportFrame[] {
  const pages = getPages(snapshot.settings, snapshot.clips);
  const multi = pages.length > 1;
  if (Array.isArray(scope) && (!scope.length || scope.some(index => !Number.isInteger(index) || !pages[index]))) throw new Error("Choose at least one existing page");
  const selected = Array.isArray(scope) ? [...new Set(scope)].map(index => pages[index]) : scope === "all" && multi ? pages : [pageAt(pages, time)];
  const frames = selected.map(page => ({ index: page.index, time: multi ? page.start : time,
    filename: exportFilename(snapshot.title, format, (scope === "all" && multi) || Array.isArray(scope) ? `-${String(page.index + 1).padStart(2, "0")}` : "", "design"),
  }));
  return namedPageExports(frames, filenamePattern, snapshot.title, pages.map(page => snapshot.settings.pageDetails?.[page.index]?.title), format, pages.map(page => snapshot.settings.pageDetails?.[page.index]?.section));
}

export function resolvePageExportScope(snapshot: ProjectSnapshot, mode: "all" | "current" | "custom" | "section", range: string, section: string): PageExportScope {
  if (mode === "custom") return parsePageExportOrder(range, getPages(snapshot.settings, snapshot.clips).length);
  if (mode === "section") { const indexes = designPageSectionIndexes(snapshot, section); if (!indexes.length) throw new Error("Choose an existing section to download"); return indexes; }
  return mode;
}
