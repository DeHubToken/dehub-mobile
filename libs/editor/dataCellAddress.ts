export function dataCellAddress(row: number, column: number): string {
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

export function dataCellPosition(address: string, rows: number, columns: number): { row: number; column: number } | null {
  const match = /^([A-L])([1-9]\d?)$/.exec(address.trim().toUpperCase());
  if (!match) return null;
  const row = Number(match[2]) - 1, column = match[1].charCodeAt(0) - 65;
  return row < rows && column < columns ? { row, column } : null;
}

export function adjacentDataCell(address: string, rows: number, columns: number, step: -1 | 1): string | null {
  const current = dataCellPosition(address, rows, columns);
  if (!current) return null;
  const index = current.row * columns + current.column + step;
  return index < 0 || index >= rows * columns ? null : dataCellAddress(Math.floor(index / columns), index % columns);
}
