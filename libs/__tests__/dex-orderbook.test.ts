import { aggregateBook, balanceFraction, displayBookLevels, formatPrice } from '../dex-orderbook';

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
  it('shows no more than five decimal places without unnecessary zeroes', () => {
    expect(formatPrice(.001)).toBe('0.001');
    expect(formatPrice(.123456)).toBe('0.12346');
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
