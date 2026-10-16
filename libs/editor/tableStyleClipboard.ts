import { tableCellRange, type TableCellStyle, type TableCellStyles } from "./tableCellStyles";

export type TableStyleClipboard = { rows: number; columns: number; styles: (TableCellStyle | null)[][] };
export function copyTableCellStyles(value: TableCellStyles | undefined, range: string, rows: number, columns: number): TableStyleClipboard {
  const picked = tableCellRange(range, rows, columns);
  return { rows: picked.rowSpan, columns: picked.columnSpan, styles: Array.from({ length: picked.rowSpan }, (_, row) => Array.from({ length: picked.columnSpan }, (_, column) => {
    const style = value?.[`${picked.row + row}:${picked.column + column}`];
    return style ? { ...style } : null;
  })) };
}
export function pasteTableCellStyles(value: TableCellStyles | undefined, range: string, rows: number, columns: number, clipboard: TableStyleClipboard): TableCellStyles | undefined {
  const picked = tableCellRange(range, rows, columns), single = picked.rowSpan === 1 && picked.columnSpan === 1;
  const height = single ? clipboard.rows : picked.rowSpan, width = single ? clipboard.columns : picked.columnSpan;
  if (picked.row + height > rows || picked.column + width > columns) throw new Error("The copied cell styles do not fit here");
  if (height % clipboard.rows || width % clipboard.columns) throw new Error("Choose a range that fits complete copies of the copied cell styles");
  const next = { ...value };
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const style = clipboard.styles[row % clipboard.rows][column % clipboard.columns], key = `${picked.row + row}:${picked.column + column}`;
    if (style) next[key] = { ...style }; else delete next[key];
  }
  return Object.keys(next).length ? next : undefined;
}
export function expandTableStyleRange(range: string, rows: number, columns: number, axis: "row" | "column" | "all"): string {
  const picked = tableCellRange(range, rows, columns), firstColumn = axis === "column" ? picked.column : 0, lastColumn = axis === "column" ? picked.column + picked.columnSpan - 1 : columns - 1;
  const firstRow = axis === "row" ? picked.row : 0, lastRow = axis === "row" ? picked.row + picked.rowSpan - 1 : rows - 1;
  return `${String.fromCharCode(65 + firstColumn)}${firstRow + 1}:${String.fromCharCode(65 + lastColumn)}${lastRow + 1}`;
}
export function commonTableCellStyle(value: TableCellStyles | undefined, range: string, rows: number, columns: number): { style: TableCellStyle; mixed: boolean } {
  try {
    const picked = tableCellRange(range, rows, columns), first = value?.[`${picked.row}:${picked.column}`] ?? {}, style: TableCellStyle = { ...first };
    let mixed = false;
    for (let row = picked.row; row < picked.row + picked.rowSpan; row++) for (let column = picked.column; column < picked.column + picked.columnSpan; column++) {
      const current = value?.[`${row}:${column}`] ?? {};
      for (const key of ["fill", "colour", "bold", "italic", "align", "verticalAlign", "fontScale"] as const) if (current[key] !== first[key]) { delete style[key]; mixed = true; }
      if (JSON.stringify(current.numberFormat) !== JSON.stringify(first.numberFormat)) { delete style.numberFormat; mixed = true; }
    }
    return { style, mixed };
  } catch { return { style: {}, mixed: false }; }
}
