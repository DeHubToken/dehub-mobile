import { CANDLE_INTERVALS, isDehubPool, parseDehubMarket } from '../../libs/dex-live-market';

it('keeps other fee tiers and chains out of the DeHub book', () => {
  const own = { chain_id: 8453, poolFee: 0, tickSpacing: 1 };
  expect([own, { ...own, poolFee: 3000, tickSpacing: 60 }, { ...own, chain_id: 56 }, { ...own, tickSpacing: 10 }].filter(isDehubPool)).toEqual([own]);
});

it('refuses an old aggregate snapshot instead of showing its price and candles', () => {
  const snapshot = { version: 1, startedAt: 120, observedAt: 150, price: 0.001, change24h: null, positions: [],
    candles: Object.fromEntries(CANDLE_INTERVALS.map(interval => [interval, []])) };
  expect(() => parseDehubMarket(snapshot)).toThrow('DeHub pool snapshot');
  expect(parseDehubMarket({ ...snapshot, marketScope: 'base-dhb-usdc-0-1' }).price).toBe(0.001);
});
