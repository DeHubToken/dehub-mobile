/**
 * The badge ladder is pegged in dollars and grandfathered per holder, which is
 * two rules that can quietly contradict each other: the ladder moves, and a
 * tier already earned does not. Both are pinned here, along with the property
 * that makes the peg safe to ship — while DHB sits at the anchor price the
 * scaled ladder is identical to the flat one the app has always drawn, so no
 * badge moves on the day it lands.
 *
 * These numbers have to stay in step with dehubweb's
 * `src/lib/__tests__/staking-badges.test.ts` and the backend's
 * `src/badge/badge-ladder-peg.spec.ts`. The app and the site draw the same
 * badge and the gateway prices its discount off the same tier; if the ladders
 * drift, the three disagree about who is who.
 */
import {
  BADGE_ORDER,
  BADGE_PRICE_ANCHOR,
  MAX_BADGE_SCALE,
  MIN_BADGE_SCALE,
  activeBadgeScale,
  badgeScaleForPrice,
  badgeThreshold,
  badgeThresholds,
  getBadgeName,
  getBadgeStanding,
  parseBadgeLock,
  resolveBadgeLock,
  setActiveBadgeScale,
} from '../../libs/misc';

jest.mock('../../config/env', () => ({
  __esModule: true,
  default: {
    CDN_BASE_URL: 'https://cdn.test.dehub.io',
    API_URL: 'https://api.test.dehub.io/api',
  },
}));

afterEach(() => {
  setActiveBadgeScale(MAX_BADGE_SCALE);
});

describe('badgeScaleForPrice', () => {
  it('is 1 at the anchor price, so the ladder the app draws is unchanged', () => {
    expect(badgeScaleForPrice(BADGE_PRICE_ANCHOR)).toBe(1);
  });

  it('halves the DHB requirement when the token doubles', () => {
    expect(badgeScaleForPrice(0.002)).toBe(0.5);
    expect(badgeScaleForPrice(0.01)).toBe(0.1);
  });

  it('never rises above 1 — a cheaper token does not raise the bar', () => {
    expect(badgeScaleForPrice(0.0005)).toBe(1);
    expect(badgeScaleForPrice(0.0000001)).toBe(1);
  });

  it('floors at MIN_BADGE_SCALE so the ladder stays in whole tokens', () => {
    expect(badgeScaleForPrice(100)).toBe(MIN_BADGE_SCALE);
  });

  it('rounds to two significant figures, so a wobble is not a renumbering', () => {
    expect(badgeScaleForPrice(0.0034)).toBe(badgeScaleForPrice(0.00341));
    expect(badgeScaleForPrice(0.0034)).toBe(0.29);
  });

  it('falls back to the reference ladder on an unreadable price', () => {
    for (const bad of [undefined, null, 0, Number.NaN, -5]) {
      expect(badgeScaleForPrice(bad as any)).toBe(1);
    }
  });
});

describe('badgeThresholds', () => {
  it('is the ladder the app has always drawn, at the anchor price', () => {
    expect(badgeThresholds(1).map((t) => t.min)).toEqual([
      10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000,
      3_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000,
    ]);
  });

  it('holds each tier dollar cost roughly constant as the price moves', () => {
    for (const price of [0.001, 0.002, 0.005, 0.01, 0.05, 0.25]) {
      const reference = badgeThresholds(1);
      badgeThresholds(badgeScaleForPrice(price)).forEach((rung, i) => {
        const target = reference[i].min * BADGE_PRICE_ANCHOR;
        expect(Math.abs(rung.min * price - target) / target).toBeLessThan(0.06);
      });
    }
  });

  it('stays strictly ascending at every scale, so no tier can swallow another', () => {
    for (const price of [0.001, 0.0013, 0.0034, 0.007, 0.019, 0.4, 1, 50]) {
      const ladder = badgeThresholds(badgeScaleForPrice(price));
      expect(ladder.map((r) => r.name)).toEqual(BADGE_ORDER);
      for (let i = 1; i < ladder.length; i++) {
        expect(ladder[i].min).toBeGreaterThan(ladder[i - 1].min);
      }
      expect(ladder[0].min).toBeGreaterThanOrEqual(1);
    }
  });

  it('quotes the numbers the peg promises — 50M for Meglodon at $0.001', () => {
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.001))).toBe(50_000_000);
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.01))).toBe(5_000_000);
    expect(badgeThreshold('Meglodon', badgeScaleForPrice(0.1))).toBe(500_000);
  });
});

describe('getBadgeName with the ladder scaled', () => {
  it('lets a smaller bag reach a higher tier once the token is worth more', () => {
    expect(getBadgeName(5_000_000, { scale: badgeScaleForPrice(0.01) })).toBe('Meglodon');
    expect(getBadgeName(5_000_000, { scale: 1 })).toBe('Killer Whale');
  });

  it('reads the active scale when a caller passes none', () => {
    setActiveBadgeScale(0.1);
    expect(activeBadgeScale()).toBe(0.1);
    expect(getBadgeName(5_000_000)).toBe('Meglodon');
  });
});

describe('the grandfather lock', () => {
  it('keeps a tier when the ladder climbs back over the holder', () => {
    const lock = { tier: 'Meglodon', requirement: 5_000_000 };
    expect(getBadgeName(5_000_000, { scale: 1 })).toBe('Killer Whale');
    expect(getBadgeName(5_000_000, { scale: 1, lock })).toBe('Meglodon');
  });

  it('drops the tier the moment the holder sells below what it cost them', () => {
    const lock = { tier: 'Meglodon', requirement: 5_000_000 };
    // Killer Whale itself costs 5,000,000 here, so one under is Tiger Shark.
    expect(getBadgeName(4_999_999, { scale: 1, lock })).toBe('Tiger Shark');
  });

  it('never demotes someone the live ladder already puts higher', () => {
    const lock = { tier: 'Crab', requirement: 10_000 };
    expect(getBadgeName(50_000_000, { scale: 1, lock })).toBe('Meglodon');
  });

  it('discards a malformed lock rather than throwing', () => {
    expect(parseBadgeLock(null)).toBeUndefined();
    expect(parseBadgeLock({ tier: 'Kraken', requirement: 10 })).toBeUndefined();
    expect(parseBadgeLock({ tier: 'Crab', requirement: 0 })).toBeUndefined();
    expect(parseBadgeLock({ tier: 'Crab' })).toBeUndefined();
    expect(parseBadgeLock({ tier: 'Crab', requirement: '2500' })).toEqual({
      tier: 'Crab',
      requirement: 2500,
    });
    expect(getBadgeName(5_000_000, { scale: 1, lock: { tier: 'Kraken' } as any })).toBe(
      'Killer Whale',
    );
  });

  it('finds the lock wherever a feed row happens to carry the author', () => {
    const lock = { tier: 'Cobra', requirement: 250_000 };
    expect(resolveBadgeLock({ badgeLock: lock })).toEqual(lock);
    expect(resolveBadgeLock({ minterUser: { badgeLock: lock } })).toEqual(lock);
    expect(resolveBadgeLock({ author: { badgeLock: lock } })).toEqual(lock);
    expect(resolveBadgeLock({})).toBeUndefined();
    expect(resolveBadgeLock(null)).toBeUndefined();
  });
});

describe('getBadgeStanding', () => {
  it('fills across the current tier, not across the whole ladder', () => {
    const standing = getBadgeStanding(17_500, { scale: 1 });
    expect(standing.tier).toBe('Crab');
    expect(standing.nextTier).toBe('Lobster');
    expect(standing.nextThreshold).toBe(25_000);
    expect(standing.remaining).toBe(7_500);
    expect(standing.progress).toBeCloseTo(0.5, 5);
  });

  it('runs from zero to Crab for someone with no badge yet', () => {
    const standing = getBadgeStanding(5_000, { scale: 1 });
    expect(standing.tier).toBeUndefined();
    expect(standing.index).toBe(-1);
    expect(standing.nextTier).toBe('Crab');
    expect(standing.progress).toBeCloseTo(0.5, 5);
  });

  it('is full and has nowhere to go at the top', () => {
    const standing = getBadgeStanding(80_000_000, { scale: 1 });
    expect(standing.tier).toBe('Meglodon');
    expect(standing.nextTier).toBeUndefined();
    expect(standing.remaining).toBe(0);
    expect(standing.progress).toBe(1);
  });

  it('flags a tier that is only held on a lock', () => {
    const lock = { tier: 'Meglodon', requirement: 5_000_000 };
    expect(getBadgeStanding(5_000_000, { scale: 1, lock }).grandfathered).toBe(true);
    expect(getBadgeStanding(50_000_000, { scale: 1, lock }).grandfathered).toBe(false);
  });

  it('treats a missing or negative balance as zero rather than as an error', () => {
    expect(getBadgeStanding(undefined, { scale: 1 }).balance).toBe(0);
    expect(getBadgeStanding(-100, { scale: 1 }).balance).toBe(0);
  });
});
