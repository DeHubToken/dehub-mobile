import { parseTableData, type TableData } from "./dataVisuals";
import { editTableStructure } from "./tableStructure";
export interface TableRowCleanupOptions { action: "empty" | "duplicates"; column: number; matchCase: boolean; trim: boolean }
export function cleanTableRows(source: string, format: Omit<TableData, "rows">, options: TableRowCleanupOptions): { source: string; format: Omit<TableData, "rows">; removed: number } {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!rows.length) throw new Error("Add table rows before cleaning them");
  if (options.action === "duplicates" && (!Number.isInteger(options.column) || options.column < -1 || options.column >= columns)) throw new Error("Choose an existing column or all columns");
  if (format.merges?.some(merge => merge.rowSpan > 1)) throw new Error("Unmerge cells spanning multiple rows before removing empty or duplicate rows");
  const normalize = (value: string) => { const text = options.trim ? value.trim() : value; return options.matchCase ? text : text.toLowerCase(); };
  const seen = new Set<string>(), removed: number[] = [], first = format.header ? 1 : 0;
  rows.forEach((row, index) => {
    if (index < first) return;
    if (options.action === "empty") { if (row.every(cell => !cell.trim())) removed.push(index); return; }
    const values = options.column === -1 ? Array.from({ length: columns }, (_, column) => row[column] ?? "") : [row[options.column] ?? ""], key = JSON.stringify(values.map(normalize));
    if (seen.has(key)) removed.push(index); else seen.add(key);
  });
  if (removed.length === rows.length) removed.shift();
  let result = { source, format };
  for (const index of [...removed].reverse()) { const next = editTableStructure(result.source, result.format, "row", index, "delete"); result = { source: next.source, format: next.format }; }
  return { ...result, removed: removed.length };
}
