import type { BulkData } from "./bulkCreate";
export interface BulkRowFilter { column?: string; operation?: "equals" | "contains" | "notEmpty" | "empty"; value?: string }
export const BULK_FILTER_OPERATIONS = [
  { id: "equals", label: "Equals" }, { id: "contains", label: "Contains" }, { id: "notEmpty", label: "Is not blank" }, { id: "empty", label: "Is blank" },
] as const;
export function bulkSelectedRows(data: BulkData, first: number, last: number, filter: BulkRowFilter = {}): number[] {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last > data.rows.length || last < first || last - first >= 50) throw new Error("Choose a valid range of up to 50 data rows");
  const column = filter.column ? data.headers.indexOf(filter.column) : -1, needle = (filter.value ?? "").trim().toLocaleLowerCase();
  const result: number[] = [];
  for (let index = first - 1; index < last; index++) {
    const value = column >= 0 ? (data.rows[index][column] ?? "").trim().toLocaleLowerCase() : "";
    if (column < 0 || (filter.operation === "empty" ? !value : filter.operation === "notEmpty" ? !!value : filter.operation === "contains" ? value.includes(needle) : value === needle)) result.push(index);
  }
  return result;
}
export function bulkSelectedCount(data: BulkData | null, first: number, last: number, filter: BulkRowFilter): number { try { return data ? bulkSelectedRows(data, first, last, filter).length : 0; } catch { return 0; } }
