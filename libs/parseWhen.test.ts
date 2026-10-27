import { parseWhen } from './parseWhen';

// Monday 26 Oct 2026, 11:00 local.
const now = new Date(2026, 9, 26, 11, 0);
const at = (text: string) => {
  const r = parseWhen(text, now);
  return r ? `${r.at.getMonth() + 1}/${r.at.getDate()} ${String(r.at.getHours()).padStart(2, '0')}:${String(r.at.getMinutes()).padStart(2, '0')}${r.hasTime ? '' : ' (day)'}` : null;
};

describe('parseWhen', () => {
  it('reads days with times', () => {
    expect(at('fri 8pm')).toBe('10/30 20:00');
    expect(at('Friday at 7:30 PM')).toBe('10/30 19:30');
    expect(at('tomorrow 9am')).toBe('10/27 09:00');
    expect(at('tomorrow noon')).toBe('10/27 12:00');
    expect(at('next mon 10am')).toBe('11/2 10:00');
    expect(at('mon 10am')).toBe('11/2 10:00');
    expect(at('mon 3pm')).toBe('10/26 15:00');
    expect(at('fri 8')).toBe('10/30 20:00');
  });
  it('reads dates', () => {
    expect(at('30 oct 7pm')).toBe('10/30 19:00');
    expect(at('nov 3rd 18:00')).toBe('11/3 18:00');
    expect(at('2/11 6pm')).toBe('11/2 18:00');
    expect(at('1 jan')).toBe('1/1 00:00 (day)');
  });
  it('reads times and relative times', () => {
    expect(at('tonight')).toBe('10/26 20:00');
    expect(at('tonight 9')).toBe('10/26 21:00');
    expect(at('8pm')).toBe('10/26 20:00');
    expect(at('9am')).toBe('10/27 09:00');
    expect(at('10:30')).toBe('10/26 22:30');
    expect(at('in 2 hours')).toBe('10/26 13:00');
    expect(at('in 30 min')).toBe('10/26 11:30');
    expect(at('in a day')).toBe('10/27 11:00');
    expect(at('thursday')).toBe('10/29 00:00 (day)');
  });
  it('refuses what it cannot read', () => {
    expect(at('')).toBeNull();
    expect(at('whenever')).toBeNull();
    expect(at('fri banana')).toBeNull();
    expect(at('13pm')).toBeNull();
    expect(at('31 feb')).toBeNull();
  });
});
