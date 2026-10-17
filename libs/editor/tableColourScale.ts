import { parseTableData } from "./dataVisuals";
import { tableCellRange, type TableCellStyles } from "./tableCellStyles";
import type { TableMerge } from "./tableMerges";
export const TABLE_COLOUR_SCALES = [
  { id: "blue", label: "Blue", low: "#eff6ff", middle: "#dbeafe", high: "#1d4ed8" },
  { id: "teal", label: "Teal", low: "#f0fdfa", middle: "#ccfbf1", high: "#0f766e" },
  { id: "violet", label: "Violet", low: "#faf5ff", middle: "#e9d5ff", high: "#7e22ce" },
  { id: "diverging", label: "Red to blue", low: "#b91c1c", middle: "#f8fafc", high: "#1d4ed8" },
] as const;
function mix(a: string, b: string, amount: number): string { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return "#" + [16, 8, 0].map(shift => Math.round((x >> shift & 255) * (1 - amount) + (y >> shift & 255) * amount).toString(16).padStart(2, "0")).join(""); }
export function readableTableInk(fill: string): string { const rgb = [1, 3, 5].map(index => parseInt(fill.slice(index, index + 2), 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff"; }
export function applyTableColourScale(source: string, range: string, styles: TableCellStyles | undefined, paletteId: string, centred: boolean, autoInk: boolean, merges: readonly TableMerge[] = []): { styles: TableCellStyles; count: number } {
  const rows = parseTableData(source), columns = Math.max(0, ...rows.map(row => row.length)), selected = tableCellRange(range, rows.length, columns), palette = TABLE_COLOUR_SCALES.find(palette => palette.id === paletteId);
  if (!palette) throw new Error("Choose an available colour scale");
  const cells: { key: string; value: number }[] = [];
  for (let row = selected.row; row < selected.row + selected.rowSpan; row++) for (let column = selected.column; column < selected.column + selected.columnSpan; column++) {
    if (merges.some(merge => row >= merge.row && row < merge.row + merge.rowSpan && column >= merge.column && column < merge.column + merge.columnSpan)) continue;
    const raw = rows[row]?.[column]?.trim() ?? "", value = Number(raw);
    if (raw && Number.isFinite(value) && Math.abs(value) <= 1e12) cells.push({ key: `${row}:${column}`, value });
  }
  if (!cells.length) throw new Error("Choose a range containing unmerged numeric cells within one trillion");
  const min = Math.min(...cells.map(cell => cell.value)), max = Math.max(...cells.map(cell => cell.value)), bound = Math.max(Math.abs(min), Math.abs(max)) || 1, next = { ...styles };
  for (const cell of cells) {
    const amount = centred ? (cell.value / bound + 1) / 2 : max === min ? 0.5 : (cell.value - min) / (max - min);
    const fill = centred ? amount < 0.5 ? mix(palette.low, palette.middle, amount * 2) : mix(palette.middle, palette.high, (amount - 0.5) * 2) : mix(palette.low, palette.high, amount);
    next[cell.key] = { ...next[cell.key], fill, ...(autoInk ? { colour: readableTableInk(fill) } : {}) };
  }
  return { styles: next, count: cells.length };
}
