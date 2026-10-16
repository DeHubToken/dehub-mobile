import { validChartValueFormat, type ChartValueFormat } from "./chartValueFormat";
import type { TableMerge } from "./tableMerges";
export interface TableCellStyle { verticalAlign?: "top" | "middle" | "bottom"; fontScale?: number; numberFormat?: ChartValueFormat; fill?: string; colour?: string; bold?: boolean; italic?: boolean; align?: "left" | "centre" | "right" }
export type TableCellStyles = Record<string, TableCellStyle>;
export function validTableCellStyles(value: unknown): value is TableCellStyles | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 240) return false;
  return Object.entries(value).every(([key, item]) => {
    if (!/^(?:[0-9]|1[0-9]):(?:[0-9]|1[01])$/.test(key) || !item || typeof item !== "object" || Array.isArray(item)) return false;
    const style = item as TableCellStyle;
    return Object.keys(style).every(key => ["fill", "colour", "bold", "italic", "align", "verticalAlign", "fontScale", "numberFormat"].includes(key)) && (style.fontScale === undefined || typeof style.fontScale === "number" && Number.isFinite(style.fontScale) && style.fontScale >= 0.5 && style.fontScale <= 3) && validChartValueFormat(style.numberFormat) && [style.fill, style.colour].every(value => value === undefined || typeof value === "string" && /^#[a-f\d]{6}$/i.test(value)) && [style.bold, style.italic].every(value => value === undefined || typeof value === "boolean") && (style.align === undefined || ["left", "centre", "right"].includes(style.align)) && (style.verticalAlign === undefined || ["top", "middle", "bottom"].includes(style.verticalAlign));
  });
}
export function tableCellRange(value: string, rows: number, columns: number): TableMerge {
  const match = value.trim().toUpperCase().match(/^([A-L])([1-9]|1\d|20)(?:\s*:\s*([A-L])([1-9]|1\d|20))?$/);
  if (!match) throw new Error("Enter a cell or range such as A1 or A1:C2");
  const r1 = Number(match[2]) - 1, r2 = Number(match[4] || match[2]) - 1, c1 = match[1].charCodeAt(0) - 65, c2 = (match[3] || match[1]).charCodeAt(0) - 65;
  const range = { row: Math.min(r1, r2), column: Math.min(c1, c2), rowSpan: Math.abs(r2 - r1) + 1, columnSpan: Math.abs(c2 - c1) + 1 };
  if (range.row + range.rowSpan > rows || range.column + range.columnSpan > columns) throw new Error("Choose cells that exist in the table");
  return range;
}
export function applyTableCellStyle(value: TableCellStyles | undefined, range: string, rows: number, columns: number, patch: TableCellStyle | null): TableCellStyles | undefined {
  if (patch && !validTableCellStyles({ "0:0": patch })) throw new Error("Choose valid cell colours and text styles");
  const picked = tableCellRange(range, rows, columns), next = { ...value };
  for (let row = picked.row; row < picked.row + picked.rowSpan; row++) for (let column = picked.column; column < picked.column + picked.columnSpan; column++) {
    const key = `${row}:${column}`;
    if (patch === null) delete next[key]; else next[key] = { ...next[key], ...patch };
  }
  return Object.keys(next).length ? next : undefined;
}
export function transposeTableCellStyles(value: TableCellStyles | undefined): TableCellStyles | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).flatMap(([key, style]) => { const [row, column] = key.split(":").map(Number); return row < 12 ? [[`${column}:${row}`, { ...style }]] : []; }));
}

export function reorderTableCellStyleRows(value: TableCellStyles | undefined, order: readonly number[]): TableCellStyles | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).flatMap(([key, style]) => { const [row, column] = key.split(":").map(Number), position = order.indexOf(row); return position < 0 ? [] : [[`${position}:${column}`, { ...style }]]; }));
}

export function mapTableCellColours(value: TableCellStyles | undefined, replace: (colour: string) => string): TableCellStyles | undefined {
  if (!value) return undefined;
  return Object.fromEntries(Object.entries(value).map(([key, style]) => [key, { ...style, ...(style.fill ? { fill: replace(style.fill) } : {}), ...(style.colour ? { colour: replace(style.colour) } : {}) }]));
}
