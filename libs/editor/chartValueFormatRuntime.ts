export const CHART_VALUE_FORMAT_RUNTIME = String.raw`const chartNumberFormatters = new Map();
function chartValueLabel(value, format) {
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
`;
