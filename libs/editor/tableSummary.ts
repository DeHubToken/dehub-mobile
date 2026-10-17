import { parseTableData, type TableData } from "./dataVisuals";
import { tableCellRange } from "./tableCellStyles";
import { editTableStructure } from "./tableStructure";
import { formatDelimitedData } from "./delimitedData";
export const TABLE_SUMMARY_OPERATIONS = ["sum", "average", "minimum", "maximum", "count"] as const;
export type TableSummaryOperation = typeof TABLE_SUMMARY_OPERATIONS[number];
export const TABLE_SUMMARY_LABELS: Record<TableSummaryOperation, string> = { sum: "Total", average: "Average", minimum: "Minimum", maximum: "Maximum", count: "Numeric count" };
export function defaultTableSummaryRange(source: string, header: boolean, headerColumn: boolean): string {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length)), startRow = header && rows.length > 1 ? 2 : 1, startColumn = headerColumn && columns > 1 ? 1 : 0;
  if (!rows.length || !columns) throw new Error("Add table data before creating a summary");
  return String.fromCharCode(65 + startColumn) + startRow + ":" + String.fromCharCode(64 + columns) + rows.length;
}
export function appendTableSummary(source: string, format: Omit<TableData, "rows">, cells: string, operation: TableSummaryOperation) {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!TABLE_SUMMARY_OPERATIONS.includes(operation)) throw new Error("Choose a summary calculation");
  if (rows.length >= 20) throw new Error("Leave one row available for the summary; tables support 20 rows");
  const range = tableCellRange(cells, rows.length, columns);
  if (format.merges?.some(merge => merge.row < range.row + range.rowSpan && merge.row + merge.rowSpan > range.row && merge.column < range.column + range.columnSpan && merge.column + merge.columnSpan > range.column)) throw new Error("Choose a summary range without merged cells");
  const summary = Array<string>(columns).fill(""); let calculated = 0;
  for (let column = range.column; column < range.column + range.columnSpan; column++) {
    const values = rows.slice(range.row, range.row + range.rowSpan).map(row => row[column]?.trim() ?? "").filter(value => value && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 1e12).map(Number);
    if (!values.length) continue;
    const sum = values.reduce((total, value) => total + value, 0), result = operation === "sum" ? sum : operation === "average" ? sum / values.length : operation === "minimum" ? Math.min(...values) : operation === "maximum" ? Math.max(...values) : values.length;
    summary[column] = String(Number(result.toPrecision(12))); calculated++;
  }
  if (!calculated) throw new Error("The selected range needs at least one numeric cell within one trillion");
  if (range.column > 0) summary[0] = TABLE_SUMMARY_LABELS[operation];
  const next = editTableStructure(source, format, "row", rows.length - 1, "after");
  const nextRows = parseTableData(next.source); nextRows[nextRows.length - 1] = summary;
  const styles = { ...next.format.cellStyles };
  for (let column = 0; column < columns; column++) styles[`${rows.length}:${column}`] = { ...styles[`${rows.length}:${column}`], bold: true };
  return { source: formatDelimitedData(nextRows, "\t"), format: { ...next.format, cellStyles: styles } };
}
