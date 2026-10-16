import { parseDelimitedData } from "./delimitedData";
import { getPages, pageAt } from "./pages";
import { pageDetails } from "./pageDetails";
import { remapDesignGroups } from "./designGroups";
import { sliceTimelineClip } from "./timelineAgent";
import { createQrGraphic, type QrGraphic } from "./qrGraphic";
import type { Clip, ProjectSnapshot, ShapeClip, TextClip } from "./types";

export interface BulkData { headers: string[]; rows: string[][] }
export type BulkConnections = Record<string, string>;
export type BulkField = TextClip | (ShapeClip & { qr: QrGraphic });
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

export function bulkTemplateFields(project: ProjectSnapshot, time: number): BulkField[] {
  const page = pageAt(getPages(project.settings, project.clips), time);
  return project.clips.filter((clip): clip is BulkField => (clip.kind === "text" || (clip.kind === "shape" && !!clip.qr)) && !clip.locked && clip.start < page.end && clip.start + clip.duration > page.start);
}

export function bulkFieldText(clip: BulkField): string { return clip.kind === "text" ? clip.text : clip.qr.content; }

export function bulkReplaceTokens(text: string, headers: string[], row: string[]): string {
  return text.replace(TOKEN, (token, name: string) => {
    const index = headers.indexOf(name.trim());
    return index >= 0 ? row[index] ?? "" : token;
  });
}

export function bulkTextValue(clip: BulkField, headers: string[], row: string[], connections: BulkConnections): string {
  const column = headers.indexOf(connections[clip.id]);
  if (column >= 0) return row[column] ?? "";
  return bulkReplaceTokens(bulkFieldText(clip), headers, row);
}

export function bulkConnected(clip: BulkField, headers: string[], connections: BulkConnections): boolean {
  return headers.includes(connections[clip.id]) || Array.from(bulkFieldText(clip).matchAll(TOKEN)).some(match => headers.includes(match[1].trim()));
}

/** Append one independent copy of the current page for every selected data row. */
export function createBulkPages(project: ProjectSnapshot, time: number, data: BulkData, connections: BulkConnections, first: number, last: number, makeId: () => string): { project: ProjectSnapshot; start: number; count: number } {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > data.rows.length || last < first || last - first >= 50) throw new Error("Choose a valid range of up to 50 data rows");
  const pages = getPages(project.settings, project.clips), template = pageAt(pages, time), count = last - first + 1;
  const duration = template.end - template.start;
  if (!Number.isFinite(duration) || duration < 0.05) throw new Error("Give the template page a duration before generating pages");
  const source = project.clips.filter(clip => clip.start < template.end && clip.start + clip.duration > template.start);
  const fields = bulkTemplateFields(project, time);
  if (!fields.some(clip => bulkConnected(clip, data.headers, connections))) throw new Error("Connect a text or QR layer, or add a matching {{column}} placeholder");
  if (pages.length + count > 500 || project.clips.length + source.length * count > 10000) throw new Error("This batch exceeds the design’s page or layer limit. Choose fewer rows");
  const start = pages[pages.length - 1].end, copies: Clip[] = [], starts = pages.map(page => page.start);
  if (start + count * duration > 86400) throw new Error("This batch exceeds the design’s 24-hour timeline limit. Choose fewer rows");
  const details = pages.map(page => pageDetails(project, page.index)), original = pageDetails(project, template.index);
  for (let index = first - 1; index < last; index++) {
    const at = start + (index - first + 1) * duration, row = data.rows[index];
    starts.push(at);
    const copied = source.flatMap<Clip>(clip => {
      const from = Math.max(clip.start, template.start), to = Math.min(clip.start + clip.duration, template.end);
      if (to - from < 0.05) return [];
      const copy = sliceTimelineClip(clip, from - clip.start, to - from, makeId(), at + from - template.start);
      if (copy.kind === "shape" && clip.kind === "shape" && clip.qr && !clip.locked) {
        const field = { ...clip, qr: clip.qr };
        if (bulkConnected(field, data.headers, connections)) {
          try { return [{ ...copy, qr: createQrGraphic(bulkTextValue(field, data.headers, row, connections), clip.qr.foreground, clip.qr.background, clip.qr) }]; }
          catch { throw new Error(`Row ${index + 1}: QR content must contain 1–1,500 characters and fit in a QR code`); }
        }
      }
      return [copy.kind === "text" && clip.kind === "text" && !clip.locked ? { ...copy, text: bulkTextValue(clip, data.headers, row, connections) } : copy];
    });
    copies.push(...remapDesignGroups(copied, makeId));
    const title = bulkReplaceTokens(original.title, data.headers, row);
    details.push({ title: (title !== original.title ? title : `${title || "Page"} · ${index + 1}`).slice(0, 200), notes: bulkReplaceTokens(original.notes, data.headers, row).slice(0, 10000) });
  }
  const next = { ...project, settings: { ...project.settings, pages: starts, pageEnd: start + count * duration, pageDetails: details }, clips: [...project.clips, ...copies] };
  let bytes = 0;
  for (const char of JSON.stringify(next)) { const point = char.codePointAt(0)!; bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4; }
  if (bytes > 6 * 1024 * 1024) throw new Error("This batch is too large to save. Choose fewer rows");
  return { project: next, start, count };
}
