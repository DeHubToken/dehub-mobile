import { parseTableData, type TableData } from "./dataVisuals";
import { formatDelimitedData } from "./delimitedData";
import type { TableMerge } from "./tableMerges";
import type { TableCellStyles } from "./tableCellStyles";

export type TableAxis = "row" | "column";
export type TableStructureAction = "before" | "after" | "duplicate" | "delete" | "earlier" | "later";
type Entry = { source: number | null; original: boolean };

export function editTableStructure(source: string, format: Omit<TableData, "rows">, axis: TableAxis, index: number, action: TableStructureAction) {
  const input = parseTableData(source), width = Math.max(0, ...input.map(row => row.length));
  const rows = input.map(row => Array.from({ length: width }, (_, column) => row[column] ?? ""));
  const count = axis === "row" ? rows.length : width, maximum = axis === "row" ? 20 : 12;
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error("Choose an existing row or column");
  const inserting = ["before", "after", "duplicate"].includes(action);
  if (inserting && count >= maximum) throw new Error(`Use at most ${maximum} ${axis === "row" ? "rows" : "columns"}`);
  if (action === "delete" && count <= 1) throw new Error("Keep at least one row and one column in the table");
  const order: Entry[] = Array.from({ length: count }, (_, source) => ({ source, original: true }));
  const position = action === "before" ? index : index + 1;
  if (inserting) order.splice(position, 0, { source: action === "duplicate" ? index : null, original: false });
  else if (action === "delete") order.splice(index, 1);
  else {
    const target = index + (action === "earlier" ? -1 : 1);
    if (target < 0 || target >= count) throw new Error("This row or column is already at the edge");
    [order[index], order[target]] = [order[target], order[index]];
  }
  const nextRows = axis === "row"
    ? order.map(entry => entry.source === null ? Array<string>(width).fill("") : [...rows[entry.source]])
    : rows.map(row => order.map(entry => entry.source === null ? "" : row[entry.source]));
  const axisKey = axis === "row" ? "row" : "column", spanKey = axis === "row" ? "rowSpan" : "columnSpan";
  const merges: TableMerge[] = [];
  for (const merge of format.merges ?? []) {
    const start = merge[axisKey], span = merge[spanKey], end = start + span;
    let nextStart = start, nextSpan = span;
    if (inserting) {
      if (action === "duplicate" && index >= start && index < end && span > 1) throw new Error("Unmerge cells crossing this row or column before duplicating it");
      if (position <= start) nextStart++;
      else if (position < end) nextSpan++;
      if (action === "duplicate" && start === index && span === 1) merges.push({ ...merge, [axisKey]: position });
    } else if (action === "delete") {
      if (index < start) nextStart--;
      else if (index < end) nextSpan--;
    } else {
      const positions = Array.from({ length: span }, (_, offset) => order.findIndex(entry => entry.original && entry.source === start + offset));
      if (positions.some((value, offset) => value !== positions[0] + offset)) throw new Error("Unmerge cells crossing these rows or columns before moving them");
      nextStart = positions[0];
    }
    const next = { ...merge, [axisKey]: nextStart, [spanKey]: nextSpan };
    if (next.rowSpan > 0 && next.columnSpan > 0 && next.rowSpan * next.columnSpan > 1) merges.push(next);
  }
  const cellStyles: TableCellStyles = {};
  for (let row = 0; row < nextRows.length; row++) for (let column = 0; column < nextRows[0].length; column++) {
    const entry = order[axis === "row" ? row : column];
    const oldIndex = entry.source ?? index;
    const oldRow = axis === "row" ? oldIndex : row, oldColumn = axis === "column" ? oldIndex : column;
    const style = format.cellStyles?.[`${oldRow}:${oldColumn}`];
    if (style) cellStyles[`${row}:${column}`] = { ...style };
  }
  const weightsKey = axis === "row" ? "rowHeights" : "columnWidths";
  const weights = format[weightsKey];
  const nextFormat = { ...format, [weightsKey]: weights ? order.map(entry => weights[entry.source ?? index] ?? 1) : undefined,
    merges: merges.length ? merges.sort((a, b) => a.row - b.row || a.column - b.column) : undefined,
    cellStyles: Object.keys(cellStyles).length ? cellStyles : undefined };
  const selected = inserting ? position : action === "delete" ? Math.min(index, order.length - 1) : order.findIndex(entry => entry.source === index);
  return { source: formatDelimitedData(nextRows, "\t"), format: nextFormat, selected };
}
