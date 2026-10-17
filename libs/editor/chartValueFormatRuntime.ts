export const CHART_VALUE_FORMAT_RUNTIME = String.raw`const CHART_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "AED", "SGD"];
const CHART_NUMBER_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "pt-BR", "ja-JP", "hi-IN", "zh-CN", "ar-AE"];
const chartNumberFormatters = new Map();
function chartValueLabel(value, format) {
  if (!Number.isFinite(value)) return "";
  if (!format) return String(value);
  const decimals = Math.max(0, Math.min(4, Number.isInteger(format.decimals) ? format.decimals : 0));
  const currency = CHART_CURRENCIES.includes(format.currency) ? format.currency : "USD";
  const locale = CHART_NUMBER_LOCALES.includes(format.locale ?? "en-US") ? format.locale ?? "en-US" : "en-US";
  const key = [locale, format.style, currency, decimals, !!format.compact].join(":");
  let formatter = chartNumberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { style: format.style === "currency" ? "currency" : "decimal", ...(format.style === "currency" ? { currency } : {}), minimumFractionDigits: decimals, maximumFractionDigits: decimals, notation: format.compact ? "compact" : "standard" });
    if (chartNumberFormatters.size >= 128) chartNumberFormatters.clear();
    chartNumberFormatters.set(key, formatter);
  }
  const prefix = typeof format.prefix === "string" ? format.prefix.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 24) : "", suffix = typeof format.suffix === "string" ? format.suffix.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 24) : "";
  return prefix + formatter.format(value) + (format.style === "percent" ? "%" : "") + suffix;
}
`;
