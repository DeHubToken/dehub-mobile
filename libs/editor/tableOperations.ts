import { formatDelimitedData } from "./delimitedData";
import { parseTableData } from "./dataVisuals";

export function transposeTableSource(source: string): string {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!rows.length || rows.length > 12 || columns > 20) throw new Error("Transposing requires at most 12 current rows so the result fits the column limit");
  return formatDelimitedData(Array.from({ length: columns }, (_, column) => rows.map(row => row[column] ?? "")), "\t");
}

export function sortTableSource(source: string, column: number, header: boolean, descending: boolean, onOrder?: (order: number[]) => void): string {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length));
  if (!Number.isInteger(column) || column < 0 || column >= columns) throw new Error("Choose a column to sort");
  const data = header ? rows.slice(1) : [...rows];
  data.sort((a, b) => {
    const left = a[column] ?? "", right = b[column] ?? "";
    const numeric = left.trim() !== "" && right.trim() !== "" && Number.isFinite(Number(left)) && Number.isFinite(Number(right));
    return (numeric ? Number(left) - Number(right) : left.localeCompare(right, "en", { numeric: true, sensitivity: "base" })) * (descending ? -1 : 1);
  });
  const sorted = header ? [rows[0], ...data] : data;
  onOrder?.(sorted.map(row => rows.indexOf(row)));
  return formatDelimitedData(sorted, "\t");
}
