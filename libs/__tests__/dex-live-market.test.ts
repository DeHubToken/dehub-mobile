import { aggregateCandles, recordCandle, restoreCandles, lowestSellPrice, CANDLE_INTERVALS } from '../dex-live-market';

describe('live sell market', () => {
  const sell = { side: 'sell', minPrice: .001, maxPrice: .002, marketPrice: .0009, amountDhb: 100 };
  it('uses the cheapest remaining sell entry across networks without display rounding', () => {
    expect(lowestSellPrice([sell, { ...sell, minPrice: .000912345, marketPrice: .0008 }])).toBe(.000912345);
    expect(lowestSellPrice([{ ...sell, marketPrice: .0015 }])).toBe(.0015);
  });
  it('ignores buys, filled, zero, invalid and exhausted sell ranges', () => {
    expect(lowestSellPrice([{ ...sell, side: 'buy' }, { ...sell, amountDhb: 0 }, { ...sell, marketPrice: .002 },
      { ...sell, minPrice: NaN }, { ...sell, amountDhb: Infinity }])).toBeNull();
  });
  it('updates OHLC in place and starts a new candle at the minute boundary', () => {
    let candles = recordCandle([], 10, 60);
    candles = recordCandle(candles, 15, 75);
    candles = recordCandle(candles, 8, 80);
    candles = recordCandle(candles, 12, 119);
    expect(candles).toEqual([{ time: 60, open: 10, high: 15, low: 8, close: 12, observedAt: 119 }]);
    const next = recordCandle(candles, 13, 120);
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ time: 120, open: 13, close: 13 });
    expect(candles).toHaveLength(1);
  });
  it('never creates synthetic observations for gaps, failures, or empty books', () => {
    const candles = recordCandle([], 10, 60);
    expect(recordCandle(candles, null, 120)).toBe(candles);
    expect(recordCandle(candles, NaN, 120)).toBe(candles);
    expect(recordCandle(candles, 20, 59)).toBe(candles);
    expect(recordCandle(candles, 20, 600).map(c => c.time)).toEqual([60, 600]);
  });
  it.each(CANDLE_INTERVALS)('aggregates %s without losing highs or lows', (interval) => {
    const candles = recordCandle(recordCandle(recordCandle([], 10, 3600), 15, 3601), 8, 3659);
    const output = aggregateCandles(candles, interval);
    expect(output).toEqual([{ time: 3600, open: 10, high: 15, low: 8, close: 8, observedAt: 3659 }]);
  });
  it('rolls up five minutes at UTC boundaries and preserves opening/closing order', () => {
    const candles = recordCandle(recordCandle(recordCandle([], 10, 240), 20, 300), 15, 360);
    expect(aggregateCandles(candles, '5m')).toEqual([
      { time: 0, open: 10, high: 10, low: 10, close: 10, observedAt: 240 },
      { time: 300, open: 20, high: 20, low: 15, close: 15, observedAt: 360 },
    ]);
  });
  it('restores valid history and discards malformed, future and expired candles', () => {
    const candles = recordCandle([], 10, 3600);
    expect(restoreCandles(JSON.stringify(candles), 3700)).toEqual(candles);
    expect(restoreCandles('invalid')).toEqual([]);
    expect(restoreCandles(JSON.stringify([{ ...candles[0], low: -1 }]), 3700)).toEqual([]);
    expect(restoreCandles(JSON.stringify(candles), 3500)).toEqual([]);
    expect(restoreCandles(JSON.stringify(candles), 3700 + 8 * 86400)).toEqual([]);
  });
});

