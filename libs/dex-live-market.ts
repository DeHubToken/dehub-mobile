export const CANDLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h'] as const;
export type CandleInterval = typeof CANDLE_INTERVALS[number];
export interface Candle { time: number; open: number; high: number; low: number; close: number; observedAt: number }
const SECONDS: Record<CandleInterval, number> = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600 };
export const CANDLE_STORAGE_KEY = 'dex-ask-candles-v1';
const RETENTION = 7 * 86400;

interface SellPosition { side: string; minPrice: number; maxPrice: number; marketPrice: number; amountDhb: number }
/** The lowest remaining sell range entry, independent of order-book display rounding. */
export function lowestSellPrice(positions: SellPosition[]): number | null {
  let lowest = Infinity;
  for (const p of positions) {
    if (p.side !== 'sell' || ![p.minPrice, p.maxPrice, p.marketPrice, p.amountDhb].every(Number.isFinite) ||
        p.minPrice <= 0 || p.maxPrice <= p.minPrice || p.marketPrice <= 0 || p.amountDhb <= 1e-9) continue;
    const price = Math.max(p.minPrice, p.marketPrice);
    if (price < p.maxPrice) lowest = Math.min(lowest, price);
  }
  return Number.isFinite(lowest) ? lowest : null;
}
export function restoreCandles(raw: string | null, now = Date.now() / 1000): Candle[] {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is Candle => c && [c.time, c.open, c.high, c.low, c.close, c.observedAt].every(Number.isFinite) &&
      c.time % 60 === 0 && c.time >= now - RETENTION && c.time <= now &&
      c.observedAt >= c.time && c.observedAt < c.time + 60 && c.observedAt <= now &&
      c.low > 0 && c.low <= Math.min(c.open, c.close) && c.high >= Math.max(c.open, c.close))
      .sort((a, b) => a.time - b.time).filter((c, i, all) => !i || c.time !== all[i - 1].time).slice(-10080);
  } catch { return []; }
}
/** Only successful onchain snapshots produce observations; missing periods stay empty. */
export function recordCandle(candles: Candle[], price: number | null, now: number): Candle[] {
  if (price == null || !Number.isFinite(price) || price <= 0 || !Number.isFinite(now)) return candles;
  const time = Math.floor(now / 60) * 60;
  const next = candles.filter((c) => c.time >= now - RETENTION);
  const last = next.at(-1);
  if (last && now < last.observedAt) return candles;
  if (last?.time === time) next[next.length - 1] = { ...last, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price, observedAt: now };
  else next.push({ time, open: price, high: price, low: price, close: price, observedAt: now });
  return next;
}
export function aggregateCandles(minutes: Candle[], interval: CandleInterval): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const candle of minutes) {
    const time = Math.floor(candle.time / SECONDS[interval]) * SECONDS[interval];
    const current = buckets.get(time);
    buckets.set(time, current ? { ...current, high: Math.max(current.high, candle.high),
      low: Math.min(current.low, candle.low), close: candle.close, observedAt: candle.observedAt } : { ...candle, time });
  }
  return [...buckets.values()].slice(-120);
}

