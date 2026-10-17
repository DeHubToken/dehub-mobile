import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
export function dataCellAddress(value: string, maxRows: number, maxColumns: number): { row: number; column: number } {
  const match = value.trim().toUpperCase().match(/^([A-Z])([1-9]\d?)$/);
  if (!match) throw new Error("Enter a starting cell such as A1 or B3");
  const row = Number(match[2]) - 1, column = match[1].charCodeAt(0) - 65;
  if (row >= maxRows || column >= maxColumns) throw new Error(`Choose a cell within ${maxRows} rows and ${maxColumns} columns`);
  return { row, column };
}
export function pasteDataCells(current: string, source: string, address: string, maxRows: number, maxColumns: number) {
  const at = dataCellAddress(address, maxRows, maxColumns), existing = parseDelimitedData(current, maxRows, maxColumns), pasted = parseDelimitedData(source, maxRows - at.row, maxColumns - at.column);
  if (!pasted.length) throw new Error("Paste one or more cells first");
  if (pasted.some(row => row.some(cell => cell.length > 200))) throw new Error("Use at most 200 characters in each cell");
  const columns = Math.max(...pasted.map(row => row.length)), width = Math.max(at.column + columns, 1, ...existing.map(row => row.length));
  const height = Math.max(existing.length, at.row + pasted.length), rows = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => existing[row]?.[column] ?? ""));
  pasted.forEach((row, r) => { for (let c = 0; c < columns; c++) rows[at.row + r][at.column + c] = row[c] ?? ""; });
  return { source: formatDelimitedData(rows, "\t"), rows: pasted.length, columns, row: at.row, column: at.column };
}
