import { pad, clamp, toNumberSafe, percent, formatCompactNumber, formatNumber, resolveViewCount } from '../../libs/numbers.util';

describe('libs/numbers.util', () => {
  describe('resolveViewCount', () => {
    it('prefers totalViews — the whole audience', () => {
      expect(resolveViewCount({ totalViews: 250, views: 200 })).toBe(250);
    });

    it('falls back to views when totalViews is absent', () => {
      // An older or cached response: undercount rather than show nothing.
      expect(resolveViewCount({ views: 200 })).toBe(200);
    });

    it('does not add the halves together', () => {
      // The bug this replaced: the anonymous half was fetched separately and
      // added to a base that had already included it, so a post with 50
      // anonymous views and no signed-in ones reported 100.
      expect(resolveViewCount({ totalViews: 50, views: 0 })).toBe(50);
    });

    it('reads a zero total as zero, not as missing', () => {
      expect(resolveViewCount({ totalViews: 0, views: 99 })).toBe(0);
    });

    it('is 0 for nothing usable', () => {
      expect(resolveViewCount(null)).toBe(0);
      expect(resolveViewCount(undefined)).toBe(0);
      expect(resolveViewCount({})).toBe(0);
      expect(resolveViewCount({ views: NaN })).toBe(0);
    });
  });

  describe('pad', () => {
    it('pads single digit to 2 chars', () => {
      expect(pad(1)).toBe('01');
      expect(pad(9)).toBe('09');
    });

    it('does not pad if already sufficient length', () => {
      expect(pad(10)).toBe('10');
      expect(pad(100)).toBe('100');
    });

    it('pads to custom size', () => {
      expect(pad(1, 3)).toBe('001');
      expect(pad(42, 5)).toBe('00042');
    });

    it('truncates decimal part', () => {
      expect(pad(3.7)).toBe('03');
    });
  });

  describe('clamp', () => {
    it('clamps value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('returns value when min > max', () => {
      expect(clamp(5, 10, 0)).toBe(5);
    });

    it('handles edge case of equal min and max', () => {
      expect(clamp(5, 3, 3)).toBe(3);
    });
  });

  describe('toNumberSafe', () => {
    it('returns number directly', () => {
      expect(toNumberSafe(42)).toBe(42);
    });

    it('parses strings', () => {
      expect(toNumberSafe('3.14')).toBeCloseTo(3.14);
    });

    it('returns fallback for non-numeric', () => {
      expect(toNumberSafe('abc')).toBe(0);
      expect(toNumberSafe('abc', -1)).toBe(-1);
      expect(toNumberSafe(NaN, 99)).toBe(99);
    });

    it('returns fallback for Infinity', () => {
      expect(toNumberSafe(Infinity)).toBe(0);
    });
  });

  describe('percent', () => {
    it('calculates percentage', () => {
      expect(percent(25, 100)).toBe(25);
      expect(percent(1, 3)).toBeCloseTo(33.33, 1);
    });

    it('returns 0 when whole is 0', () => {
      expect(percent(5, 0)).toBe(0);
    });

    it('respects custom precision', () => {
      expect(percent(1, 3, 0)).toBe(33);
      expect(percent(1, 3, 4)).toBeCloseTo(33.3333, 3);
    });
  });

  describe('formatCompactNumber', () => {
    it('returns "0" for null/undefined/NaN/Infinity', () => {
      expect(formatCompactNumber(null)).toBe('0');
      expect(formatCompactNumber(undefined)).toBe('0');
      expect(formatCompactNumber(NaN)).toBe('0');
      expect(formatCompactNumber(Infinity)).toBe('0');
    });

    it('formats small integers', () => {
      expect(formatCompactNumber(0)).toBe('0');
      expect(formatCompactNumber(42)).toBe('42');
      expect(formatCompactNumber(999)).toBe('999');
    });

    it('formats thousands with K suffix', () => {
      expect(formatCompactNumber(1000)).toBe('1K');
      expect(formatCompactNumber(1500)).toBe('1.5K');
      expect(formatCompactNumber(999_999)).toBe('1000.0K');
    });

    it('formats millions with M suffix', () => {
      expect(formatCompactNumber(1_000_000)).toBe('1M');
      expect(formatCompactNumber(2_500_000)).toBe('2.5M');
    });

    it('formats billions with B suffix', () => {
      expect(formatCompactNumber(1_000_000_000)).toBe('1B');
    });

    it('handles negative numbers', () => {
      expect(formatCompactNumber(-5000)).toBe('-5K');
    });

    it('handles fractional numbers < 1', () => {
      const result = formatCompactNumber(0.000123);
      expect(result).toBeTruthy();
      expect(result).not.toBe('0');
    });

    it('trims trailing zeros for decimals < 1000', () => {
      expect(formatCompactNumber(1.50)).toBe('1.5');
      expect(formatCompactNumber(2.00)).toBe('2');
    });
  });

  describe('formatNumber', () => {
    it('returns "0" for null/undefined', () => {
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });

    it('formats with locale separators', () => {
      const result = formatNumber(1234567);
      // Locale-dependent but should contain digits
      expect(result).toMatch(/1.*234.*567/);
    });

    it('uses more decimals for values < 1', () => {
      const result = formatNumber(0.00012345);
      expect(result).not.toBe('0');
    });
  });
});
