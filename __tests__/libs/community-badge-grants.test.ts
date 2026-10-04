import { getBadgeName } from '../../libs/misc';

describe('community badge grants', () => {
  it('applies a grant when no balance is available', () => {
    expect(getBadgeName(Number.NaN, { username: 'dehubprime', scale: 1 })).toBe('King Cobra');
  });

  it('normalises the granted username', () => {
    expect(getBadgeName(0, { username: ' @DEHUBPRIME ', scale: 1 })).toBe('King Cobra');
  });

  it('keeps a higher badge earned after a grant', () => {
    expect(getBadgeName(2_000_000, { username: 'dehubprime', scale: 1 })).toBe('Dolphin');
  });

  it('keeps a higher grandfathered badge above the grant', () => {
    expect(getBadgeName(10_000, {
      username: 'dehubprime', scale: 1,
      lock: { tier: 'Killer Whale', requirement: 10_000 },
    })).toBe('Killer Whale');
  });

  it('leaves accounts without a grant below the entry rung', () => {
    expect(getBadgeName(0, { username: 'not-granted', scale: 1 })).toBeUndefined();
  });
});
