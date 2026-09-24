/**
 * Normalises a typed money amount. Comma-decimal keyboards (most of Europe,
 * LatAm, etc.) type "12,50"; stripping the comma used to turn that into 1250.
 * Accepts "," or "." as the decimal mark, keeps a single one, drops anything
 * else. Pass `decimals: 0` for whole-number fields.
 */
export function sanitizeAmountInput(raw: string, decimals = 18): string {
  const text = String(raw ?? '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  if (decimals <= 0) return text.replace(/\./g, '');
  const dot = text.indexOf('.');
  if (dot === -1) return text;
  const whole = text.slice(0, dot);
  const frac = text.slice(dot + 1).replace(/\./g, '').slice(0, decimals);
  return `${whole || '0'}.${frac}`;
}

/** Numeric value of a (possibly comma-decimal) amount string; NaN when empty. */
export function parseAmountInput(raw: string): number {
  const clean = sanitizeAmountInput(raw);
  return clean === '' ? NaN : Number(clean);
}
