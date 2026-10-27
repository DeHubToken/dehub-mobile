import { countdownParts } from './countdown';

const now = new Date(2026, 9, 26, 12, 0).getTime();
const later = (min: number) => new Date(now + min * 60_000);

describe('countdownParts', () => {
  it('reads days, hours and minutes', () => {
    expect(countdownParts(later(45), now)).toBe('45m');
    expect(countdownParts(later(60), now)).toBe('1h');
    expect(countdownParts(later(200), now)).toBe('3h 20m');
    expect(countdownParts(later(1440 * 2 + 360), now)).toBe('2d 6h');
    expect(countdownParts(later(1440 * 3), now)).toBe('3d');
  });
  it('is empty once due', () => {
    expect(countdownParts(later(0), now)).toBeNull();
    expect(countdownParts(later(-5), now)).toBeNull();
    expect(countdownParts(null, now)).toBeNull();
  });
});
