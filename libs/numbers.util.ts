// Numeric helper utilities
// Central place for small reusable numeric helpers

export function pad(n: number, size: number = 2): string {
  const s = String(Math.trunc(n));
  return s.length >= size ? s : s.padStart(size, '0');
}

export function clamp(value: number, min: number, max: number): number {
  if (min > max) return value; // fail-soft
  return Math.min(max, Math.max(min, value));
}

export function toNumberSafe(v: unknown, fallback = 0): number {
  const num = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(num) ? num : fallback;
}

export function percent(part: number, whole: number, precision = 2): number {
  if (!whole) return 0;
  const p = (part / whole) * 100;
  const factor = 10 ** precision;
  return Math.round(p * factor) / factor;
}

// Compact number formatting: 1, 39, 400, 1K, 1.8K, 20M, etc.
export function formatCompactNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || !isFinite(value)) return '0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  // Small value formatting (<1) – mimic ETH balance formatting logic (up to 6 decimals)
  if (abs > 0 && abs < 1) {
    const fixed = abs.toFixed(6); // 6 decimals
    // Trim trailing zeros and optional decimal point
    const trimmed = fixed.replace(/\.?(0+)$/,'').replace(/\.0+$/,'');
    return sign + (trimmed === '' ? '0' : trimmed);
  }
  // For values between 1 and 999.999..., cap to 2 decimals and trim trailing zeros
  if (abs < 1000) {
    const fixed = abs % 1 === 0 ? abs.toString() : abs.toFixed(2);
    const trimmed = fixed.replace(/\.?0+$/, '');
    return sign + trimmed;
  }
  const fmt = (num: number) => (num % 1 === 0 ? num.toString() : num.toFixed(1));
  if (abs < 1_000_000) return sign + fmt(abs / 1_000) + 'K';
  if (abs < 1_000_000_000) return sign + fmt(abs / 1_000_000) + 'M';
  return sign + fmt(abs / 1_000_000_000) + 'B';
}

// Plain number formatter with thousand separators and up to 2-4 decimals depending on magnitude
export function formatNumber(value: number | undefined | null, maxDecimals: number = 2): string {
  if (value === undefined || value === null || !isFinite(value)) return '0';
  const abs = Math.abs(value);
  let decimals = maxDecimals;
  if (abs < 1) decimals = Math.min(6, Math.max(decimals, 4));
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return rounded.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export const NumbersUtil = { pad, clamp, toNumberSafe, percent, formatCompactNumber, formatNumber };

export default NumbersUtil;
