import { isHalloweenDay, msUntilLocalMidnight } from '../../libs/halloweenOverride';

describe('Halloween 2026 Horror override window', () => {
  it('only runs on 31 Oct 2026 local time', () => {
    expect(isHalloweenDay(new Date(2026, 9, 31, 0, 0, 1))).toBe(true);
    expect(isHalloweenDay(new Date(2026, 9, 31, 23, 59, 59))).toBe(true);
    expect(isHalloweenDay(new Date(2026, 10, 1, 0, 0, 0))).toBe(false);
    expect(isHalloweenDay(new Date(2026, 9, 30, 23, 59, 59))).toBe(false);
    expect(isHalloweenDay(new Date(2027, 9, 31, 12))).toBe(false);
  });

  it('wakes at the next local midnight', () => {
    expect(msUntilLocalMidnight(new Date(2026, 9, 31, 23, 0))).toBe(3600_000);
  });
});
