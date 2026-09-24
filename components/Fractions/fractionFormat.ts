/**
 * Small display helpers shared by the fraction market's cards, sheets and
 * rails. Plain functions over the translator rather than hooks, so rows can
 * call them inside a render without each one subscribing to i18n.
 */
import type { TFunction } from "i18next";

export function shortAddress(address: string | null | undefined): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function fmt(value: number, maxDigits = 2): string {
  return (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

export function relativeTime(iso: string, t: TFunction): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return t("fractions.justNow");
  if (mins < 60) return t("fractions.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("fractions.hoursAgo", { count: hours });
  return t("fractions.daysAgo", { count: Math.floor(hours / 24) });
}

/** "3h left", "overdue by 2h" — the deadline is the whole point of an open trade. */
export function deadlineLabel(settleBy: string | null, t: TFunction): { text: string; overdue: boolean } {
  if (!settleBy) return { text: "", overdue: false };
  const ms = new Date(settleBy).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const hours = Math.floor(abs / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const span = hours > 0 ? `${hours}h` : `${mins}m`;
  return { text: t(overdue ? "fractions.overdueBy" : "fractions.timeLeft", { span }), overdue };
}

/** "4m", "2h" — how fast a seller usually settles. */
export function formatSettleTime(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/** Parse a typed whole number, clamped into [min, max]. */
export function clampInt(text: string, min: number, max: number): number {
  const n = parseInt(text.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Two-column grids give the odd tile out an empty partner, so it keeps half
 * the row instead of stretching across all of it.
 */
export function padGrid<T>(items: T[]): (T | null)[] {
  return items.length % 2 ? [...items, null] : items;
}

export const WARN = "#FCD34D";
export const OK = "#6EE7B7";
