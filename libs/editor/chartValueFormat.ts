export interface ChartValueFormat { style: "number" | "percent" | "currency"; currency: "USD" | "EUR" | "GBP" | "JPY"; decimals: number; compact: boolean }
export function validChartValueFormat(value: unknown): value is ChartValueFormat | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object") return false;
  const v = value as ChartValueFormat;
  return ["number", "percent", "currency"].includes(v.style) && ["USD", "EUR", "GBP", "JPY"].includes(v.currency) && Number.isInteger(v.decimals) && v.decimals >= 0 && v.decimals <= 4 && typeof v.compact === "boolean";
}
const chartNumberFormatters = new Map<string, Intl.NumberFormat>();
export function chartValueLabel(value: number, format?: ChartValueFormat): string {
  if (!Number.isFinite(value)) return "";
  if (!format) return String(value);
  const decimals = Math.max(0, Math.min(4, Number.isInteger(format.decimals) ? format.decimals : 0));
  const currency = ["USD", "EUR", "GBP", "JPY"].includes(format.currency) ? format.currency : "USD";
  const key = [format.style, currency, decimals, !!format.compact].join(":");
  let formatter = chartNumberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", { style: format.style === "currency" ? "currency" : "decimal", ...(format.style === "currency" ? { currency } : {}), minimumFractionDigits: decimals, maximumFractionDigits: decimals, notation: format.compact ? "compact" : "standard" });
    if (chartNumberFormatters.size >= 128) chartNumberFormatters.clear();
    chartNumberFormatters.set(key, formatter);
  }
  return formatter.format(value) + (format.style === "percent" ? "%" : "");
}
