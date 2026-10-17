export const CHART_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "AED", "SGD"] as const;
export const CHART_NUMBER_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "pt-BR", "ja-JP", "hi-IN", "zh-CN", "ar-AE"] as const;
export const CHART_LOCALE_LABELS: Record<typeof CHART_NUMBER_LOCALES[number], string> = { "en-US": "English (US)", "en-GB": "English (UK)", "de-DE": "Deutsch", "fr-FR": "Français", "es-ES": "Español", "pt-BR": "Português (Brasil)", "ja-JP": "日本語", "hi-IN": "हिन्दी", "zh-CN": "中文", "ar-AE": "العربية" };
export interface ChartValueFormat { locale?: typeof CHART_NUMBER_LOCALES[number]; prefix?: string; suffix?: string; style: "number" | "percent" | "currency"; currency: typeof CHART_CURRENCIES[number]; decimals: number; compact: boolean }
export function validChartValueFormat(value: unknown): value is ChartValueFormat | undefined {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as ChartValueFormat;
  return ["number", "percent", "currency"].includes(v.style) && CHART_CURRENCIES.includes(v.currency) && (v.locale === undefined || CHART_NUMBER_LOCALES.includes(v.locale)) && Number.isInteger(v.decimals) && v.decimals >= 0 && v.decimals <= 4 && typeof v.compact === "boolean" && [v.prefix, v.suffix].every(value => value === undefined || typeof value === "string" && value.length <= 24 && !/[\u0000-\u001f\u007f]/.test(value));
}
const chartNumberFormatters = new Map<string, Intl.NumberFormat>();
export function chartValueLabel(value: number, format?: ChartValueFormat): string {
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
