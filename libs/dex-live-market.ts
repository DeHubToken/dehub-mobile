export const CANDLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h'] as const;
export type CandleInterval = typeof CANDLE_INTERVALS[number];
export interface Candle { time: number; open: number; high: number; low: number; close: number; observedAt: number }
export interface ExternalAsk { price: number; dhb: number }
export interface SharedMarket<Position = unknown> {
  version: 1; startedAt: number; observedAt: number; price: number | null; change24h: number | null;
  /** The cheapest DHB in any pool, in dollars — not a blend, so it is a price someone could
   *  actually pay. liquidityUsd is the quote side only: the money a seller could be paid out
   *  of. lpDhb is the DHB inventory sitting in every pool, which is a token count, not money.
   *  All absent on snapshots written before they landed, so readers treat them as optional. */
  usdPrice?: number | null; liquidityUsd?: number | null; lpDhb?: number | null;
  /** Ask depth from the DHB pools outside this order book, already priced in dollars. */
  externalAsks?: ExternalAsk[];
  positions: Position[]; candles: Record<CandleInterval, Candle[]>;
}
export function parseSharedMarket<Position>(data: unknown): SharedMarket<Position> {
  const value = data as SharedMarket<Position> | null;
  if (!value || value.version !== 1 || !Number.isFinite(value.startedAt) || !Number.isFinite(value.observedAt) ||
      value.observedAt < value.startedAt || !Array.isArray(value.positions) ||
      (value.price !== null && (!Number.isFinite(value.price) || value.price <= 0)) ||
      (value.usdPrice != null && (!Number.isFinite(value.usdPrice) || value.usdPrice <= 0)) ||
      (value.liquidityUsd != null && (!Number.isFinite(value.liquidityUsd) || value.liquidityUsd < 0)) ||
      (value.lpDhb != null && (!Number.isFinite(value.lpDhb) || value.lpDhb < 0)) ||
      (value.externalAsks != null && (!Array.isArray(value.externalAsks) || !value.externalAsks.every((a) =>
        Number.isFinite(a?.price) && a.price > 0 && Number.isFinite(a?.dhb) && a.dhb >= 0))) ||
      !CANDLE_INTERVALS.every((interval) => Array.isArray(value.candles?.[interval]) &&
        value.candles[interval].every((c) => [c.time,c.open,c.high,c.low,c.close,c.observedAt].every(Number.isFinite) &&
          c.low > 0 && c.low <= Math.min(c.open,c.close) && c.high >= Math.max(c.open,c.close)))) {
    throw new Error('Shared market snapshot is not available');
  }
  return value;
}
/** One read per minute per runtime; all chart intervals arrive in the same cached response. */
export function minuteCache<T>(read: () => Promise<T>, now: () => number = Date.now) {
  let cached: { value: T; at: number } | undefined;
  let pending: Promise<T> | undefined;
  let generation = 0;
  const call = (() => {
    if (cached && Math.floor(now() / 60000) === cached.at) return Promise.resolve(cached.value);
    if (!pending) {
      const startedAt = generation;
      pending = read().then((value) => {
        // A snapshot announced while this read was in flight makes the answer stale on arrival,
        // and caching it would hold the screen on the old minute until the next one begins.
        if (generation === startedAt) cached = { value, at: Math.floor(now() / 60000) };
        return value;
      }).finally(() => { pending = undefined; });
    }
    return pending;
  }) as (() => Promise<T>) & { invalidate: () => void };
  /** Drop the cached minute because the server says it has a newer snapshot than this one. */
  call.invalidate = () => { generation += 1; cached = undefined; };
  return call;
}

