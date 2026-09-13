import { dhbPosition, dhbBreakdown, dhbStaked } from '../../libs/dhb-position';

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

/**
 * The staked half on its own. The staking card used to derive this from
 * Supabase `staking_records`, which only holds deposits made through the apps
 * — a wallet that transferred DHB straight to the staking address has 0 rows
 * there and read as nothing staked.
 */
describe('dhbStaked', () => {
  it('sums the staked column across the counted chains', () => {
    const user = {
      balanceData: [
        { chainId: 56, walletBalance: 10, staked: 3100000.09806 },
        { chainId: 8453, walletBalance: 20, staked: 8000000 },
      ],
    };
    expect(dhbStaked(user)).toBeCloseTo(11100000.09806, 5);
  });

  it('reports the deposit a client-side ledger cannot see', () => {
    // cadizforniacrypto, 2026-09-13: 50,000 in the pool, no staking_records
    // rows at all, so the card showed 0 against an Assets row of 55K.
    const user = { balanceData: [{ chainId: 8453, walletBalance: 5000, staked: 50000 }] };
    expect(dhbStaked(user)).toBe(50000);
    expect(dhbPosition(user)).toBe(55000);
  });

  it('ignores chains the badge ladder does not count', () => {
    const user = {
      balanceData: [
        { chainId: 1, walletBalance: 1150000, staked: 900 },
        { chainId: 8453, walletBalance: 0, staked: 200 },
      ],
    };
    expect(dhbStaked(user)).toBe(200);
  });

  it('is null — not zero — when the server has said nothing', () => {
    // Zero would be indistinguishable from "nothing staked", and the caller
    // needs to tell them apart to decide whether to fall back.
    expect(dhbStaked({})).toBeNull();
    expect(dhbStaked(null)).toBeNull();
    expect(dhbStaked({ balanceData: [{ chainId: 1, staked: 5 }] })).toBeNull();
  });

  it('reads a row that carries no staked column as zero, not as absent', () => {
    expect(dhbStaked({ balanceData: [{ chainId: 8453, walletBalance: 5000 }] })).toBe(0);
  });
});
