import { parseDelimitedData } from "./delimitedData";
import { getPages, pageAt } from "./pages";
import { pageDetails } from "./pageDetails";
import { remapDesignGroups } from "./designGroups";
import { sliceTimelineClip } from "./timelineAgent";
import type { Clip, ProjectSnapshot, TextClip } from "./types";

export interface BulkData { headers: string[]; rows: string[][] }
export type BulkConnections = Record<string, string>;
const TOKEN = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function parseBulkData(source: string): BulkData {
  const [header, ...rows] = parseDelimitedData(source, 51, 20);
  if (!header || !rows.length) throw new Error("Add a header row and at least one data row");
  const headers = header.map(value => value.trim());
  if (headers.some(value => !value || value.length > 100) || new Set(headers).size !== headers.length) throw new Error("Give each column a unique name of 1–100 characters");
  if (rows.some(row => row.length > headers.length)) throw new Error("Each row must fit the header columns");
  if (rows.some(row => row.some(cell => cell.length > 10000))) throw new Error("Keep each cell under 10,000 characters");
  return { headers, rows: rows.map(row => headers.map((_, index) => row[index] ?? "")) };
}

export function bulkTemplateText(project: ProjectSnapshot, time: number): TextClip[] {
  const page = pageAt(getPages(project.settings, project.clips), time);
  return project.clips.filter((clip): clip is TextClip => clip.kind === "text" && !clip.locked && clip.start < page.end && clip.start + clip.duration > page.start);
}

export function bulkTextValue(clip: TextClip, headers: string[], row: string[], connections: BulkConnections): string {
  const column = headers.indexOf(connections[clip.id]);
  if (column >= 0) return row[column] ?? "";
  return clip.text.replace(TOKEN, (token, name: string) => {
    const index = headers.indexOf(name.trim());
    return index >= 0 ? row[index] ?? "" : token;
  });
}

export function bulkConnected(clip: TextClip, headers: string[], connections: BulkConnections): boolean {
  return headers.includes(connections[clip.id]) || Array.from(clip.text.matchAll(TOKEN)).some(match => headers.includes(match[1].trim()));
}

/** Append one independent copy of the current page for every selected data row. */
export function createBulkPages(project: ProjectSnapshot, time: number, data: BulkData, connections: BulkConnections, first: number, last: number, makeId: () => string): { project: ProjectSnapshot; start: number; count: number } {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > data.rows.length || last < first || last - first >= 50) throw new Error("Choose a valid range of up to 50 data rows");
  const pages = getPages(project.settings, project.clips), template = pageAt(pages, time), count = last - first + 1;
  const duration = template.end - template.start;
  if (!Number.isFinite(duration) || duration < 0.05) throw new Error("Give the template page a duration before generating pages");
  const source = project.clips.filter(clip => clip.start < template.end && clip.start + clip.duration > template.start);
  const fields = bulkTemplateText(project, time);
  if (!fields.some(clip => bulkConnected(clip, data.headers, connections))) throw new Error("Connect a text layer or add a matching {{column}} placeholder");
  if (pages.length + count > 500 || project.clips.length + source.length * count > 10000) throw new Error("This batch exceeds the design’s page or layer limit. Choose fewer rows");
  const start = pages[pages.length - 1].end, copies: Clip[] = [], starts = pages.map(page => page.start);
  const details = pages.map(page => pageDetails(project, page.index)), original = pageDetails(project, template.index);
  for (let index = first - 1; index < last; index++) {
    const at = start + (index - first + 1) * duration, row = data.rows[index];
    starts.push(at);
    const copied = source.flatMap(clip => {
      const from = Math.max(clip.start, template.start), to = Math.min(clip.start + clip.duration, template.end);
      if (to - from < 0.05) return [];
      const copy = sliceTimelineClip(clip, from - clip.start, to - from, makeId(), at + from - template.start);
      return [copy.kind === "text" && clip.kind === "text" && !clip.locked ? { ...copy, text: bulkTextValue(clip, data.headers, row, connections) } : copy];
    });
    copies.push(...remapDesignGroups(copied, makeId));
    details.push({ ...original, title: `${original.title || "Page"} · ${index + 1}`.slice(0, 200) });
  }
  const next = { ...project, settings: { ...project.settings, pages: starts, pageEnd: start + count * duration, pageDetails: details }, clips: [...project.clips, ...copies] };
  if (JSON.stringify(next).length > 3000000) throw new Error("This batch is too large to save. Choose fewer rows");
  return { project: next, start, count };
}
