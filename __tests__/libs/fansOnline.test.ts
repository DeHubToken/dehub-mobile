import { bestTime, toLocalGrid } from '../../libs/fansOnline';

const empty = () => Array.from({ length: 7 }, () => new Array(24).fill(0));

describe('toLocalGrid', () => {
  it('keeps the grid as is when the clock is on UTC', () => {
    const utc = empty();
    utc[2][20] = 9;
    const local = toLocalGrid(utc, { getTimezoneOffset: () => 0 } as Date);
    expect(local[2][20]).toBe(9);
  });

  it('moves slots forward for a zone ahead of UTC and wraps the week', () => {
    const utc = empty();
    utc[6][23] = 4; // Saturday 23:00 UTC
    const local = toLocalGrid(utc, { getTimezoneOffset: () => -120 } as Date); // UTC+2
    expect(local[0][1]).toBe(4); // Sunday 01:00
  });
});

describe('bestTime', () => {
  it('picks the busiest hour still ahead, sooner on ties', () => {
    const now = new Date(2026, 9, 26, 10, 15); // Monday
    const local = empty();
    local[2][20] = 7; // Tuesday 20:00
    local[4][20] = 7; // Thursday 20:00
    const at = bestTime(local, now.getTime(), now)!;
    expect([at.getDay(), at.getHours(), at.getMinutes()]).toEqual([2, 20, 0]);
  });

  it('respects the earliest allowed time', () => {
    const now = new Date(2026, 9, 26, 10, 15);
    const local = empty();
    local[1][11] = 9;
    local[1][15] = 3;
    const at = bestTime(local, new Date(2026, 9, 26, 12).getTime(), now)!;
    expect(at.getHours()).toBe(15);
  });

  it('is null when nobody watched', () => {
    expect(bestTime(empty(), 0, new Date(2026, 9, 26))).toBeNull();
  });
});
