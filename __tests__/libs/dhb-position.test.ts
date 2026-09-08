import { dhbPosition, dhbBreakdown } from '../../libs/dhb-position';

/**
 * DHB is held plus staked across Base and BNB. Most of a real account's DHB is
 * staked, so anything reading only the liquid balance reports a fraction of
 * what the user has — the Settings row did exactly that.
 */
describe('dhbPosition', () => {
  it('prefers the server sum', () => {
    expect(dhbPosition({ ownBadgeBalance: 11100000.09806 })).toBeCloseTo(11100000.09806, 5);
  });

  it('falls back to the per-chain rows when the server sum is absent', () => {
    const user = {
      balanceData: [
        { chainId: 56, walletBalance: 0, staked: 3100000.09806 },
        { chainId: 8453, walletBalance: 0, staked: 8000000 },
      ],
    };
    expect(dhbPosition(user)).toBeCloseTo(11100000.09806, 5);
  });

  it('never lets a delegated badge figure through', () => {
    // badgeBalance is deliberately not read; only ownBadgeBalance counts.
    const user = { badgeBalance: 999999999, balanceData: [{ chainId: 8453, staked: 500 }] } as any;
    expect(dhbPosition(user)).toBe(500);
  });

  it('uses the liquid balance only when the server has said nothing', () => {
    expect(dhbPosition({}, 42)).toBe(42);
    expect(dhbPosition(null, '17')).toBe(17);
    expect(dhbPosition(undefined)).toBe(0);
  });

  it('ignores chains the badge ladder does not count', () => {
    const user = {
      balanceData: [
        { chainId: 1, walletBalance: 1150000, staked: 0 },
        { chainId: 8453, walletBalance: 0, staked: 200 },
      ],
    };
    expect(dhbPosition(user)).toBe(200);
    expect(dhbBreakdown(user).rows).toHaveLength(1);
  });
});
