import { pageDetails } from "./pageDetails";
import { getPages, pageAt } from "./pages";
import type { PageExportScope } from "./pageExports";
import type { ProjectSnapshot } from "./types";
export function presentationNotesText(project: ProjectSnapshot, time: number, scope: PageExportScope): string {
  const pages = getPages(project.settings, project.clips);
  const indexes = Array.isArray(scope) ? [...new Set(scope)] : scope === "all" ? pages.map(page => page.index) : [pageAt(pages, time).index];
  if (!indexes.length || indexes.some(index => !Number.isInteger(index) || !pages[index])) throw new Error("Choose existing pages for the notes file");
  const line = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  const parts = [line(project.title) || "Presentation notes", ""]; let previous = "";
  for (const index of indexes) {
    const details = pageDetails(project, index), section = details.section || "";
    if (section && section !== previous) parts.push(`Section: ${section}`, "");
    previous = section;
    parts.push(`Page ${index + 1}${details.title.trim() ? ` — ${line(details.title)}` : ""}`, details.notes.replace(/\r\n?/g, "\n").trim(), "");
  }
  const result = parts.join("\n") + "\n";
  let bytes = 0; for (const char of result) { const value = char.codePointAt(0)!; bytes += value < 128 ? 1 : value < 2048 ? 2 : value < 65536 ? 3 : 4; }
  if (bytes > 4 * 1024 * 1024) throw new Error("Choose fewer pages to keep the notes file within 4 MiB");
  return result;
}
