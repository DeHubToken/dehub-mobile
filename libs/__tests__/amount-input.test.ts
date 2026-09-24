import { sanitizeAmountInput, parseAmountInput } from '../amount-input';

describe('amount input', () => {
  it('reads a comma as the decimal mark instead of dropping it', () => {
    expect(sanitizeAmountInput('12,50', 2)).toBe('12.50');
    expect(parseAmountInput('1,5')).toBe(1.5);
  });
  it('keeps one decimal mark and caps the fraction', () => {
    expect(sanitizeAmountInput('1.2.3')).toBe('1.23');
    expect(sanitizeAmountInput('9,999', 2)).toBe('9.99');
    expect(sanitizeAmountInput(',5')).toBe('0.5');
  });
  it('strips everything else and supports whole-number fields', () => {
    expect(sanitizeAmountInput('$ 1 000')).toBe('1000');
    expect(sanitizeAmountInput('12,7', 0)).toBe('127');
    expect(Number.isNaN(parseAmountInput(''))).toBe(true);
  });
});
