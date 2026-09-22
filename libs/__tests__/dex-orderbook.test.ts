import { BOOK_BAND, aggregateBook, balanceFraction, defaultOrderPrice, displayBookLevels, fillFraction, formatBookPrice, formatIncrement, formatPrice, incrementDecimals, nearestBookLevels, spreadPercent, priceDeviation, priceNeedsWarning, seedReference } from '../dex-orderbook';

describe('combined range liquidity', () => {
  const range = { minPrice: .001, maxPrice: .00121 };
  it('combines liquidity across networks and conserves both reserves', () => {
    const positions = [
      { ...range, marketPrice: .0009, amountDhb: 1000, amountUsdc: 0, chain_id: 8453 },
      { ...range, marketPrice: .0009, amountDhb: 2000, amountUsdc: 0, chain_id: 56 },
      { ...range, marketPrice: .0013, amountDhb: 0, amountUsdc: 110, chain_id: 56 },
    ];
    const { bids, asks } = aggregateBook(positions);
    expect(asks.reduce((sum, p) => sum + p.dhb, 0)).toBeCloseTo(3000, 8);
    expect(bids.reduce((sum, p) => sum + p.usdc, 0)).toBeCloseTo(110, 8);
    expect(bids.reduce((sum, p) => sum + p.dhb, 0)).toBeCloseTo(100000, 6);
    expect(asks.at(-1)?.cumulativeDhb).toBeCloseTo(3000, 8);
    expect(bids[0].price).toBeGreaterThan(bids.at(-1)!.price);
    expect(asks[0].price).toBeLessThan(asks.at(-1)!.price);
  });
  it('includes both sides of a partially converted position regardless of indexed side', () => {
    const { bids, asks } = aggregateBook([{ ...range, marketPrice: .0011, amountDhb: 450, amountUsdc: .55 }]);
    expect(bids.length).toBeGreaterThan(0); expect(asks.length).toBeGreaterThan(0);
    expect(asks.reduce((sum, p) => sum + p.dhb, 0)).toBeCloseTo(450, 8);
    expect(bids.reduce((sum, p) => sum + p.usdc, 0)).toBeCloseTo(.55, 10);
    expect(bids[0].price).toBeLessThanOrEqual(.0011);
    expect(asks[0].price).toBeGreaterThanOrEqual(.0011);
  });
  it('rounds grouped bids down and asks up, preserving reserve totals', () => {
    const { bids, asks } = aggregateBook([{ ...range, marketPrice: .001105, amountDhb: 5, amountUsdc: 2 }], .00001);
    expect(bids[0].price).toBeLessThanOrEqual(.001105);
    expect(asks[0].price).toBeGreaterThanOrEqual(.001105);
    expect(asks.at(-1)?.cumulativeDhb).toBeCloseTo(5, 9);
  });
  it('renders the cheapest ask at the bottom beside the spread', () => {
    const { asks } = aggregateBook([{ ...range, marketPrice: .001, amountDhb: 5, amountUsdc: 0 }]);
    const displayed = displayBookLevels(asks, false);
    expect(displayed[0].price).toBeGreaterThan(displayed.at(-1)!.price);
    expect(displayed.at(-1)!.price).toBe(asks[0].price);
  });
  it('keeps only the levels nearest the spread, in display order', () => {
    const { bids, asks } = aggregateBook([{ ...range, marketPrice: .0011, amountDhb: 450, amountUsdc: .55 }]);
    const nearAsks = nearestBookLevels(asks, false, 3);
    expect(nearAsks).toHaveLength(3);
    expect(nearAsks.at(-1)!.price).toBe(asks[0].price);
    const nearBids = nearestBookLevels(bids, true, 3);
    expect(nearBids[0].price).toBe(bids[0].price);
    expect(nearestBookLevels(bids, true, 500)).toHaveLength(bids.length);
  });
  it('shows no more than five decimal places without unnecessary zeroes', () => {
    expect(formatPrice(.001)).toBe('0.001');
    expect(formatPrice(.123456)).toBe('0.12346');
  });
  it('keeps five significant digits for sub-cent prices so neighbouring listings differ', () => {
    expect(formatPrice(.0010001033)).toBe('0.0010001');
    expect(formatPrice(.0010010037)).toBe('0.001001');
    expect(formatPrice(.0010000417)).toBe('0.001');
    expect(formatPrice(.00000006)).toBe('0.00000006');
    expect(formatPrice(1.0000026)).toBe('1.00');
    expect(formatPrice(0)).toBe('0.00');
    expect(formatPrice(null)).toBe('—');
  });
  it('prints book rows with exactly the grouping precision', () => {
    expect(incrementDecimals(.000001)).toBe(6);
    expect(incrementDecimals(.00000001)).toBe(8);
    expect(incrementDecimals(.00001)).toBe(5);
    expect(formatBookPrice(.001001, .000001)).toBe('0.001001');
    expect(formatBookPrice(.00100004, .00000001)).toBe('0.00100004');
    expect(formatBookPrice(.001, .00001)).toBe('0.00100');
    expect(formatIncrement(.000001)).toBe('0.000001');
    expect(formatIncrement(.00001)).toBe('0.00001');
  });
  it('reports the spread relative to the mid price', () => {
    expect(spreadPercent(.001, .001001)).toBeCloseTo(.09995, 4);
    expect(spreadPercent(0, 0)).toBeNull();
  });
  it('seeds the ticket one step clear of the pool price on each side', () => {
    const market = .0010000416923231982;
    expect(defaultOrderPrice('sell', market)).toBe('0.00100100');
    expect(defaultOrderPrice('buy', market)).toBe('0.00099900');
    expect(Number(defaultOrderPrice('sell', market, .00000001))).toBeGreaterThan(market * 1.0004);
    expect(Number(defaultOrderPrice('buy', market, .00000001))).toBeLessThan(market * .9996);
    expect(defaultOrderPrice('sell', null)).toBe('0.00100000');
    expect(defaultOrderPrice('buy', NaN)).toBe('0.00100000');
  });
  it('measures how much of a range order has converted', () => {
    const sell = { minPrice: .0010000033, maxPrice: .0010009037, side: 'sell' as const };
    expect(fillFraction({ ...sell, marketPrice: .0010000417 })).toBeCloseTo(.043, 2);
    expect(fillFraction({ ...sell, marketPrice: .0009 })).toBe(0);
    expect(fillFraction({ ...sell, marketPrice: .002 })).toBe(1);
    const buy = { minPrice: .000998, maxPrice: .000999, side: 'buy' as const };
    expect(fillFraction({ ...buy, marketPrice: .0009985 })).toBeCloseTo(.5, 1);
    expect(fillFraction({ ...buy, marketPrice: .002 })).toBe(0);
    expect(fillFraction({ ...buy, marketPrice: .0005 })).toBe(1);
    expect(fillFraction({ minPrice: 0, maxPrice: 1, marketPrice: .5, side: 'buy' })).toBe(0);
  });
  it('keeps a full-range position from inventing levels far off the market', () => {
    // A real /dex position: full range, 0.3% pool, holding dust. Sampling all 77 orders of
    // magnitude put bids at 0.000001 and an ask at 0.169 either side of a 0.001 market.
    const full = { minPrice: 2.9543e-27, maxPrice: 3.3849e50, marketPrice: 9.937337e-4, amountDhb: 8.69, amountUsdc: 0.008637 };
    const { bids, asks } = aggregateBook([full], .000001);
    expect(bids.length).toBeGreaterThan(0);
    expect(asks.length).toBeGreaterThan(0);
    for (const level of [...bids, ...asks]) {
      expect(level.price).toBeGreaterThanOrEqual(full.marketPrice / BOOK_BAND);
      expect(level.price).toBeLessThanOrEqual(full.marketPrice * BOOK_BAND);
    }
    // Only the share of each reserve that really sits in the band is shown, never all of it.
    expect(asks.reduce((sum, p) => sum + p.dhb, 0)).toBeLessThan(full.amountDhb);
    expect(bids.reduce((sum, p) => sum + p.usdc, 0)).toBeLessThan(full.amountUsdc);
    expect(bids.reduce((sum, p) => sum + p.usdc, 0)).toBeGreaterThan(0);
  });
  it('still shows a narrow position whole, and drops one stranded outside the band', () => {
    const narrow = { minPrice: .001, maxPrice: .00121, marketPrice: .0011, amountDhb: 450, amountUsdc: .55 };
    const { asks } = aggregateBook([narrow]);
    expect(asks.reduce((sum, p) => sum + p.dhb, 0)).toBeCloseTo(450, 8);
    const stranded = { minPrice: 1, maxPrice: 1.0009, marketPrice: .001, amountDhb: 387.59, amountUsdc: 0 };
    expect(aggregateBook([stranded])).toEqual({ bids: [], asks: [] });
  });
  it('ignores invalid ranges and withdrawn positions', () => {
    expect(aggregateBook([{ ...range, marketPrice: .0011, amountDhb: 0, amountUsdc: 0 },
      { ...range, marketPrice: NaN, amountDhb: 10, amountUsdc: 10 }])).toEqual({ bids: [], asks: [] });
  });
  it('never rounds MAX or a percentage above an exact token balance', () => {
    expect(balanceFraction('9007199254740993.999999999999999999', 100, 18)).toBe('9007199254740993.999999999999999999');
    expect(balanceFraction('1.000001', 25, 6)).toBe('0.25');
    expect(balanceFraction('0.000000000000000001', 50, 18)).toBe('0');
  });
});

describe('ticket anchoring against the aggregate market', () => {
  it('anchors sells on the higher and buys on the lower of pool and market', () => {
    expect(seedReference('sell', 0.001, 0.0025)).toBe(0.0025);
    expect(seedReference('buy', 0.001, 0.0025)).toBe(0.001);
    expect(seedReference('sell', null, 0.0025)).toBe(0.0025);
    expect(seedReference('buy', null, null)).toBeNull();
  });
  it('warns only in the direction that costs the trader', () => {
    expect(priceDeviation(0.001, 0.0025)).toBeCloseTo(-0.6, 10);
    expect(priceNeedsWarning('sell', 0.001, 0.0025)).toBe(true);
    expect(priceNeedsWarning('sell', 0.003, 0.0025)).toBe(false);
    expect(priceNeedsWarning('buy', 0.003, 0.0025)).toBe(true);
    expect(priceNeedsWarning('buy', 0.001, 0.0025)).toBe(false);
    expect(priceNeedsWarning('buy', 0.001, null)).toBe(false);
  });
});
