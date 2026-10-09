/** The bridge API returns en-US grouped strings, independently of the reader's locale. */
export function formatBridgeAmount(value: unknown, locale = 'en-US'): string {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return '—';
  const amount = Number(raw.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return '—';
  return amount.toLocaleString(locale, { maximumFractionDigits: 4 });
}
