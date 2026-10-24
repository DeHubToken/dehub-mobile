import { chartXValue } from "./chartDateAxis";
import { treemapDataError } from "./treemapChart";
import { cleanDataNumber, type DataNumberFormat } from "./dataRangeActions";
import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
export interface DataImportOptions {
  mode: "chart" | "table" | "bulk"; header: boolean; multiple: boolean; labelColumn: string; columns: string;
  hierarchy?: boolean; numericX?: boolean; dateX?: boolean; start: number; count: number; numberFormat: "plain" | DataNumberFormat; skipEmpty: boolean; blanksAsZero: boolean;
}
export interface MappedDataImport { source: string; multiple: boolean; header: boolean; rows: string[][]; count: number; columns: number }
export function importColumnName(index: number): string {
  let name = "", value = index + 1;
  do { value--; name = String.fromCharCode(65 + value % 26) + name; value = Math.floor(value / 26); } while (value > 0);
  return name;
}
export function importColumnIndex(value: string, columns: number): number {
  const name = value.trim().toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(name)) throw new Error("Choose a column letter such as A or AB");
  let index = 0; for (const letter of name) index = index * 26 + letter.charCodeAt(0) - 64;
  if (index < 1 || index > columns) throw new Error("Choose an existing source column");
  return index - 1;
}
export function importColumns(value: string, columns: number, maximum: number): number[] {
  const picked: number[] = [];
  for (const part of value.split(",")) {
    const range = part.split(":");
    if (!part.trim() || range.length > 2) throw new Error("Choose columns such as B, D:F");
    const first = importColumnIndex(range[0], columns), last = importColumnIndex(range[1] ?? range[0], columns), step = first <= last ? 1 : -1;
    for (let column = first; ; column += step) { if (!picked.includes(column)) picked.push(column); if (picked.length > maximum) throw new Error(`Choose at most ${maximum} columns`); if (column === last) break; }
  }
  return picked;
}
export type DataImportDelimiter = "auto" | "comma" | "tab" | "semicolon";
export function parseDataImport(source: string, delimiter: DataImportDelimiter = "auto"): string[][] {
  let separator: "," | "\t" | ";" = delimiter === "tab" ? "\t" : delimiter === "semicolon" ? ";" : ",";
  if (delimiter === "auto") {
    let quoted = false, commas = 0, tabs = 0, semicolons = 0;
    for (let i = 0; i < Math.min(source.length, 500000); i++) {
      const char = source[i];
      if (char === '"') { if (quoted && source[i + 1] === '"') i++; else quoted = !quoted; }
      else if (!quoted) { if (char === "\n" || char === "\r") { if (commas || tabs || semicolons) break; } else if (char === "\t") tabs++; else if (char === ";") semicolons++; else if (char === ",") commas++; }
    }
    separator = tabs ? "\t" : semicolons > commas ? ";" : ",";
  }
  return parseDelimitedData(source, 1001, 100, separator);
}
export function mapDataImport(rows: readonly (readonly string[])[], options: DataImportOptions): MappedDataImport {
  const columns = Math.max(0, ...rows.map(row => row.length)), maximum = options.mode === "table" ? 20 - Number(options.header) : 50;
  if (!columns) throw new Error("Choose a file containing data rows");
  if (!Number.isInteger(options.start) || options.start < 1 || !Number.isInteger(options.count) || options.count < 1 || options.count > maximum) throw new Error(`Choose a starting data row and one to ${maximum} rows`);
  const body = rows.slice(options.header ? 1 : 0).filter(row => !options.skipEmpty || row.some(cell => cell.trim())), selected = body.slice(options.start - 1, options.start - 1 + options.count);
  if (!selected.length) throw new Error("The selected data-row range is empty");
  const picked = importColumns(options.columns, columns, options.mode === "bulk" ? 20 : options.mode === "table" ? 12 : 6), headings = rows[0] ?? [];
  if (options.mode === "bulk") {
    if (!options.header) throw new Error("Bulk data needs a heading row");
    const names = picked.map(column => (headings[column] ?? "").trim());
    if (names.some(name => !name || name.length > 100) || new Set(names).size !== names.length) throw new Error("Choose unique, nonempty headings of up to 100 characters");
    const result = [names, ...selected.map(row => picked.map(column => row[column] ?? ""))];
    if (result.slice(1).some(row => row.some(cell => cell.length > 10000))) throw new Error("Imported bulk cells need at most 10,000 characters");
    return { source: formatDelimitedData(result, "\t"), multiple: false, header: true, rows: result, count: selected.length, columns: picked.length };
  }
  if (options.mode === "table") {
    const result = [...(options.header ? [picked.map(column => headings[column] ?? "")] : []), ...selected.map(row => picked.map(column => row[column] ?? ""))];
    if (result.some(row => row.some(cell => cell.length > 200))) throw new Error("Imported table cells need at most 200 characters");
    return { source: formatDelimitedData(result, "\t"), multiple: false, header: options.header, rows: result, count: selected.length, columns: picked.length };
  }
  const labelColumns = options.hierarchy ? importColumns(options.labelColumn, columns, 6) : [importColumnIndex(options.labelColumn, columns)], labelColumn = labelColumns[0], multiple = options.multiple || picked.length > 1;
  const numberCell = (raw: string): number => {
    const cleaned = !raw && options.blanksAsZero ? "0" : options.numberFormat === "plain" ? raw : cleanDataNumber(raw, options.numberFormat);
    const value = cleaned === null || !cleaned ? NaN : Number(cleaned);
    return Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : NaN;
  };
  const data = selected.map((row, index) => {
    let label = (row[labelColumn] ?? "").trim();
    if (options.hierarchy && labelColumns.length > 1) {
      const parts = labelColumns.map(column => (row[column] ?? "").trim());
      if (parts.some(part => !part || part.includes("/"))) throw new Error(`Data row ${options.start + index} needs filled category cells without /`);
      label = parts.join(" / ");
    }
    if (options.dateX) {
      if (!Number.isFinite(chartXValue(label, "date"))) throw new Error(`Data row ${options.start + index} needs an ISO date or UTC timestamp in the X column`);
    } else if (options.numericX) {
      const x = numberCell(label);
      if (!Number.isFinite(x)) throw new Error(`Data row ${options.start + index} needs a numeric X coordinate within one trillion`);
      label = String(x);
    }
    if (!label || label.length > 200) throw new Error(`Data row ${options.start + index} needs a label of one to 200 characters in column ${importColumnName(labelColumn)}`);
    return [label, ...picked.map(column => {
      const number = numberCell((row[column] ?? "").trim());
      if (!Number.isFinite(number) || Math.abs(number) > 1e12) throw new Error(`Data row ${options.start + index}, column ${importColumnName(column)} needs a number within one trillion`);
      return String(number);
    })];
  });
  if (options.hierarchy) {
    const error = treemapDataError(data.map(row => ({ label: row[0], value: Number(row[1]) })));
    if (error) throw new Error(error);
  }
  const used = new Set<string>(), names = picked.map((column, index) => {
    const base = (options.header ? headings[column]?.trim() : "")?.slice(0, 190) || `Series ${index + 1}`;
    let name = base, serial = 2; while (used.has(name)) name = base + ` (${serial++})`; used.add(name); return name;
  });
  const result = multiple ? [[options.header ? headings[labelColumn] || "Label" : "Label", ...names], ...data] : data;
  if (result.some(row => row.some(cell => cell.length > 200))) throw new Error("Keep column headings within 200 characters");
  return { source: formatDelimitedData(result, "\t"), multiple, header: false, rows: result, count: selected.length, columns: picked.length + 1 };
}
