import { CHART_CURRENCIES } from "./chartValueFormat";
import { dataCellAddress } from "./dataCellPaste";
import { formatDelimitedData, parseDelimitedData } from "./delimitedData";
export const DATA_NUMBER_FORMATS = ["dot-comma", "comma-dot", "dot-space"] as const;
export type DataNumberFormat = typeof DATA_NUMBER_FORMATS[number];
export function cleanDataNumber(input: string, format: DataNumberFormat): string | null {
  const currency = CHART_CURRENCIES.join("|") + "|[$€£¥₹₩₽₺₴₦₱฿₫₪₡]";
  const pattern = new RegExp("^\\s*(\\()?\\s*([+-])?\\s*(?:" + currency + ")?\\s*([+-])?\\s*([\\d., ]+)\\s*(?:" + currency + ")?\\s*(%)?\\s*(\\))?\\s*$", "i");
  const match = input.replace(/[\u00a0\u202f]/g, " ").match(pattern);
  if (!match || !!match[1] !== !!match[6] || match[2] && match[3] || match[1] && (match[2] || match[3])) return null;
  const decimal = format === "comma-dot" ? "," : ".", group = format === "comma-dot" ? "." : format === "dot-space" ? " " : ",";
  const number = match[4].trim().replace(/ +/g, group), escape = (value: string) => value === "." ? "\\." : value;
  const grammar = new RegExp("^(?:\\d+|\\d{1,3}(?:" + escape(group) + "\\d{3})+)(?:" + escape(decimal) + "\\d+)?$");
  if (!grammar.test(number)) return null;
  const normalized = number.split(group).join("").replace(decimal, "."), negative = !!match[1] || (match[2] || match[3]) === "-", value = Number(normalized) * (negative ? -1 : 1);
  return Number.isFinite(value) && Math.abs(value) <= 1e12 ? String(value) : null;
}
export function editDataRange(source: string, address: string, maxRows: number, maxColumns: number, action: "fill" | "clear" | "numbers", value = "", numberFormat: DataNumberFormat = "dot-comma"): { source: string; changed: number; selected: number } {
  const rows = parseDelimitedData(source, maxRows, maxColumns);
  if (!rows.length) throw new Error("Add data before editing a range");
  const columns = Math.max(...rows.map(row => row.length));
  const parts = address.trim() ? address.trim().toUpperCase().split(":") : [];
  if (parts.length > 2) throw new Error("Enter a cell range such as B2:C6, or leave blank for all cells");
  const first = parts.length ? dataCellAddress(parts[0], rows.length, columns) : { row: 0, column: 0 }, last = parts.length ? dataCellAddress(parts[1] ?? parts[0], rows.length, columns) : { row: rows.length - 1, column: columns - 1 };
  if (value.length > 200) throw new Error("Use at most 200 characters in a cell");
  const top = Math.min(first.row, last.row), bottom = Math.max(first.row, last.row), left = Math.min(first.column, last.column), right = Math.max(first.column, last.column), next = rows.map(row => [...row]);
  let changed = 0;
  for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
    const before = rows[row][column] ?? "", after = action === "fill" ? value : action === "clear" ? "" : cleanDataNumber(before, numberFormat) ?? before;
    if (before === after) continue;
    while (next[row].length <= column) next[row].push("");
    next[row][column] = after; changed++;
  }
  return { source: changed ? formatDelimitedData(next, "\t") : source, changed, selected: (bottom - top + 1) * (right - left + 1) };
}
