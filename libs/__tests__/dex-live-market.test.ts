import { minuteCache, parseSharedMarket, CANDLE_INTERVALS } from '../dex-live-market';

describe('shared minute market', () => {
  const candle = { time: 120, open: 2, high: 3, low: 1, close: 2, observedAt: 150 };
  const snapshot = { version: 1, startedAt: 120, observedAt: 150, price: 2, change24h: null, positions: [],
    candles: Object.fromEntries(CANDLE_INTERVALS.map((interval) => [interval, [candle]])) };
  it('uses the same server candles for every interval without rebuilding device history', () => {
    expect(parseSharedMarket(snapshot)).toBe(snapshot);
    for (const interval of CANDLE_INTERVALS) expect(parseSharedMarket(snapshot).candles[interval]).toEqual([candle]);
  });
  it('accepts an empty sell book without inventing a price', () => {
    expect(parseSharedMarket({ ...snapshot, price: null }).price).toBeNull();
  });
  it('rejects missing and malformed snapshots', () => {
    for (const value of [null, {}, { ...snapshot, price: NaN }, { ...snapshot, candles: {} },
      { ...snapshot, observedAt: 100 }, { ...snapshot, candles: { ...snapshot.candles, '1m': [{ ...candle, high: 0 }] } }]) {
      expect(() => parseSharedMarket(value)).toThrow();
    }
  });
  it('reads once per minute even when multiple panels or foreground events request it', async () => {
    let now = 0, calls = 0;
    const read = minuteCache(async () => ++calls, () => now);
    expect(await Promise.all([read(), read(), read()])).toEqual([1, 1, 1]);
    now = 59000; expect(await read()).toBe(1);
    now = 60000; expect(await read()).toBe(2);
    expect(calls).toBe(2);
  });
  it('expires on the next minute even if a response took time to arrive', async () => {
    let now = 5000, calls = 0;
    const read = minuteCache(async () => { now += 1500; return ++calls; }, () => now);
    await read(); now = 65000;
    expect(await read()).toBe(2);
  });
  it('goes back to the server when a newer snapshot is announced inside the same minute', async () => {
    let now = 0, calls = 0;
    const read = minuteCache(async () => ++calls, () => now);
    expect(await read()).toBe(1);
    expect(await read()).toBe(1);
    read.invalidate();
    expect(await read()).toBe(2);
    expect(await read()).toBe(2);
  });
  it('does not cache a read that was already in flight when the announcement arrived', async () => {
    let now = 0, calls = 0, release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = minuteCache(async () => { await gate; return ++calls; }, () => now);
    const inFlight = read();
    read.invalidate();
    release();
    expect(await inFlight).toBe(1);
    expect(await read()).toBe(2);
  });
  it('does not cache errors or fabricate fresh timestamps when reads fail', async () => {
    let calls = 0;
    const read = minuteCache(async () => { if (++calls === 1) throw Error('unavailable'); return snapshot; });
    await expect(read()).rejects.toThrow('unavailable');
    expect(await read()).toBe(snapshot);
    expect(calls).toBe(2);
  });
});

