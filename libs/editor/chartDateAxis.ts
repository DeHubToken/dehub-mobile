import { CHART_NUMBER_LOCALES, chartValueLabel } from "./chartValueFormat";
import type { ChartData } from "./dataVisuals";
export type ChartDateFormat = "short" | "month" | "year" | "time" | "datetime";
export const CHART_DATE_FORMATS: readonly ChartDateFormat[] = ["short", "month", "year", "time", "datetime"];
export const CHART_DATE_MIN = -62135596800000;
export const CHART_DATE_MAX = 253402300799999;
const chartDateFormatters = new Map<string, Intl.DateTimeFormat>();

export function chartXValue(label: string, mode?: string): number {
  const source = label.trim();
  if (mode !== "date") { const value = source ? Number(source) : NaN; return Number.isFinite(value) && Math.abs(value) <= 1e12 ? value : NaN; }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z)?$/.exec(source);
  if (!match) return NaN;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]), hour = Number(match[4] ?? 0), minute = Number(match[5] ?? 0), second = Number(match[6] ?? 0), milliseconds = Number((match[7] ?? "").padEnd(3, "0"));
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return NaN;
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(hour, minute, second, milliseconds);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return NaN;
  return date.getTime();
}

export function chartXLabel(value: number, chart: Pick<ChartData, "xAxisMode" | "xDateFormat" | "xDateLocale" | "xValueFormat">): string {
  if (chart.xAxisMode !== "date") return chartValueLabel(value, chart.xValueFormat);
  if (!Number.isFinite(value) || value < CHART_DATE_MIN || value > CHART_DATE_MAX) return "";
  const locale = CHART_NUMBER_LOCALES.includes(chart.xDateLocale ?? "en-US") ? chart.xDateLocale ?? "en-US" : "en-US", format = chart.xDateFormat ?? "short", key = locale + ":" + format;
  let formatter = chartDateFormatters.get(key);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = format === "year" ? { year: "numeric" } : format === "month" ? { year: "numeric", month: "short" } : format === "time" ? { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" } : format === "datetime" ? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { year: "numeric", month: "short", day: "numeric" };
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    if (chartDateFormatters.size >= 64) chartDateFormatters.clear(); chartDateFormatters.set(key, formatter);
  }
  return formatter.format(new Date(value));
}

export function chartDateBounds(minimum: string, maximum: string): Pick<ChartData, "scaleXMin" | "scaleXMax"> {
  const scaleXMin = minimum.trim() ? chartXValue(minimum, "date") : undefined, scaleXMax = maximum.trim() ? chartXValue(maximum, "date") : undefined;
  if ([scaleXMin, scaleXMax].some(value => value !== undefined && !Number.isFinite(value))) throw new Error("Use ISO dates such as 2026-01-31 or UTC timestamps such as 2026-01-31T14:30Z");
  if (scaleXMin !== undefined && scaleXMax !== undefined && scaleXMin >= scaleXMax) throw new Error("The first date must be before the last date");
  return { scaleXMin, scaleXMax };
}
