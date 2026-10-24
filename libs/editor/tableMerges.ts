export interface TableMerge { row: number; column: number; rowSpan: number; columnSpan: number }
export function validTableMerges(value: unknown, rows: number, columns: number): value is TableMerge[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 120) return false;
  const occupied = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const merge = item as TableMerge;
    if (![merge.row, merge.column, merge.rowSpan, merge.columnSpan].every(Number.isInteger) || merge.row < 0 || merge.column < 0 || merge.rowSpan < 1 || merge.columnSpan < 1 || merge.rowSpan * merge.columnSpan < 2 || merge.row + merge.rowSpan > rows || merge.column + merge.columnSpan > columns) return false;
    for (let row = merge.row; row < merge.row + merge.rowSpan; row++) for (let column = merge.column; column < merge.column + merge.columnSpan; column++) {
      const key = `${row}:${column}`; if (occupied.has(key)) return false; occupied.add(key);
    }
  }
  return true;
}
export function tableMergeLabel(merge: TableMerge): string { return `${String.fromCharCode(65 + merge.column)}${merge.row + 1}:${String.fromCharCode(64 + merge.column + merge.columnSpan)}${merge.row + merge.rowSpan}`; }
export function parseTableMergeRange(value: string, rows: number, columns: number): TableMerge {
  const match = value.trim().toUpperCase().match(/^([A-L])([1-9]|1\d|20)\s*:\s*([A-L])([1-9]|1\d|20)$/);
  if (!match) throw new Error("Enter a cell range such as A1:C2");
  const r1 = Number(match[2]) - 1, r2 = Number(match[4]) - 1, c1 = match[1].charCodeAt(0) - 65, c2 = match[3].charCodeAt(0) - 65;
  const merge = { row: Math.min(r1, r2), column: Math.min(c1, c2), rowSpan: Math.abs(r2 - r1) + 1, columnSpan: Math.abs(c2 - c1) + 1 };
  if (!validTableMerges([merge], rows, columns)) throw new Error("Choose at least two existing cells in the table");
  return merge;
}
export function addTableMerge(current: TableMerge[] | undefined, value: string, rows: number, columns: number): TableMerge[] {
  const merge = parseTableMergeRange(value, rows, columns), next = [...(current ?? []), merge];
  if (!validTableMerges(next, rows, columns)) throw new Error("This range overlaps another merged area. Unmerge that area first");
  return next.sort((a, b) => a.row - b.row || a.column - b.column);
}
