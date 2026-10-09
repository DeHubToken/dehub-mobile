import { formatBridgeAmount } from '../../libs/bridge-amount';

describe('bridge transfer amounts', () => {
  it('preserves the grouped amount returned for a real bridge deposit', () => {
    expect(formatBridgeAmount('38,009')).toBe('38,009');
    expect(formatBridgeAmount('38,009', 'de-DE')).toBe('38.009');
  });
  it('supports ungrouped numbers and small transfers', () => {
    expect(formatBridgeAmount(38009)).toBe('38,009');
    expect(formatBridgeAmount('0.0123')).toBe('0.0123');
    expect(formatBridgeAmount('0')).toBe('0');
  });
  it.each(['', '38,00', 'failed', null, undefined, NaN, Infinity, -1])('does not turn missing or invalid data into a zero transfer: %s', value => {
    expect(formatBridgeAmount(value)).toBe('—');
  });
});
