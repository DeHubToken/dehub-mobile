import { setDefaultOptions } from 'date-fns';
import { ar, es, fr, nl, tr, enUS } from 'date-fns/locale';

const locales = { ar, es, fr, nl, tr };
export function applyDateLocale(language: string): void {
  setDefaultOptions({ locale: locales[language as keyof typeof locales] || enUS });
}

export function formatRelativeTime(input: string | number | Date | null | undefined, language: string, style: 'long' | 'short' | 'narrow' = 'long'): string {
  const value = input == null ? NaN : new Date(input).getTime();
  const elapsed = Number.isFinite(value) ? Math.max(0, Date.now() - value) : 0;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 86400000], ['month', 30 * 86400000], ['week', 7 * 86400000],
    ['day', 86400000], ['hour', 3600000], ['minute', 60000],
  ];
  const [unit, size] = units.find(([, duration]) => elapsed >= duration) || ['second', Infinity];
  let formatter: Intl.RelativeTimeFormat;
  try { formatter = new Intl.RelativeTimeFormat(language.replace('_', '-'), { numeric: 'auto', style }); }
  catch { formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style }); }
  return formatter.format(-Math.floor(elapsed / size), unit);
}
