import { parseBulkData } from "./bulkCreate";
import { bulkSelectedRows, type BulkRowFilter } from "./bulkRowFilter";
import { formatDelimitedData } from "./delimitedData";
export type BulkDataExportScope = "all" | "batch" | "headers";
export function bulkDataExport(source: string, scope: BulkDataExportScope, first: number, last: number, filter: BulkRowFilter, delimiter: "," | "\t" = ",", formulasAsText = true): string {
  if (source.length > 500000) throw new Error("Keep spreadsheet data under 500 KB before exporting");
  const data = parseBulkData(source), indexes = scope === "batch" ? bulkSelectedRows(data, first, last, filter) : data.rows.map((_, index) => index);
  if (scope === "batch" && !indexes.length) throw new Error("No records match the current batch range and filter");
  const rows = [data.headers, ...(scope === "headers" ? [] : indexes.map(index => data.rows[index]))];
  const safe = (value: string) => formulasAsText && /^[\u0000-\u0020]*[=+@-]/.test(value) && !(value.trim() && Number.isFinite(Number(value))) ? "'" + value : value;
  return formatDelimitedData(rows.map(row => row.map(safe)), delimiter);
}
