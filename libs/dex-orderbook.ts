export interface BookPosition {
  minPrice: number; maxPrice: number; marketPrice: number; amountDhb: number; amountUsdc: number;
}
export interface BookLevel { price: number; dhb: number; usdc: number; cumulativeDhb: number }
/** Grouping steps offered by the order book, finest first. */
export const BOOK_INCREMENTS = [0.00000001, 0.0000001, 0.000001, 0.00001] as const;
export const DEFAULT_INCREMENT = 0.000001;

/** Indicative AMM depth from actual reserves. An in-range LP contributes to both sides.
 * Sample log-price intervals using concentrated-liquidity reserve math, not the indexed deposit amount.
 */
export function aggregateBook(positions: BookPosition[], increment = 0.00000001) {
  const bids = new Map<number, BookLevel>(), asks = new Map<number, BookLevel>();
  const step = Number.isFinite(increment) && increment > 0 ? increment : 0.00000001;
  const add = (book: Map<number, BookLevel>, price: number, dhb: number, usdc: number, bid: boolean) => {
    const bucket = (bid ? Math.floor(price / step + 1e-8) : Math.ceil(price / step - 1e-8)) * step;
    const key = Number(bucket.toPrecision(12));
    if (key <= 0 || !Number.isFinite(dhb) || dhb <= 1e-9) return;
    const level = book.get(key) || { price: key, dhb: 0, usdc: 0, cumulativeDhb: 0 };
    level.dhb += dhb; level.usdc += usdc; book.set(key, level);
  };
  for (const p of positions) {
    if (![p.minPrice, p.maxPrice, p.marketPrice, p.amountDhb, p.amountUsdc].every(Number.isFinite) ||
        p.minPrice <= 0 || p.maxPrice <= p.minPrice || p.marketPrice <= 0) continue;
    const mid = Math.min(p.maxPrice, Math.max(p.minPrice, p.marketPrice));
    for (const bid of [true, false]) {
      const lo = bid ? p.minPrice : mid, hi = bid ? mid : p.maxPrice;
      const reserve = bid ? p.amountUsdc : p.amountDhb;
      if (reserve <= 0 || hi <= lo) continue;
      const rootLo = Math.sqrt(lo), rootHi = Math.sqrt(hi);
      for (let i = 0; i < 24; i++) {
        const a = lo * Math.pow(hi / lo, i / 24), b = lo * Math.pow(hi / lo, (i + 1) / 24);
        const fraction = bid ? (Math.sqrt(b) - Math.sqrt(a)) / (rootHi - rootLo)
          : (1 / Math.sqrt(a) - 1 / Math.sqrt(b)) / (1 / rootLo - 1 / rootHi);
        const average = Math.sqrt(a * b);
        const dhb = bid ? reserve * fraction / average : reserve * fraction;
        add(bid ? bids : asks, bid ? b : a, dhb, bid ? reserve * fraction : dhb * average, bid);
      }
    }
  }
  const finish = (book: Map<number, BookLevel>, bid: boolean) => {
    let total = 0;
    return [...book.values()].sort((a, b) => bid ? b.price - a.price : a.price - b.price)
      .map((level) => ({ ...level, cumulativeDhb: (total += level.dhb) }));
  };
  return { bids: finish(bids, true), asks: finish(asks, false) };
}
/** Keep the best price beside the spread: asks descend toward it, bids already descend from it. */
export function displayBookLevels(levels: BookLevel[], bid: boolean) {
  return bid ? levels : [...levels].reverse();
}
/** The `count` levels closest to the spread, in display order, for surfaces without their own scroll box. */
export function nearestBookLevels(levels: BookLevel[], bid: boolean, count: number) {
  const displayed = displayBookLevels(levels, bid);
  return bid ? displayed.slice(0, count) : displayed.slice(Math.max(0, displayed.length - count));
}
/** Decimal places a grouping step needs so neighbouring grouped rows never print as the same price. */
export function incrementDecimals(increment: number) {
  if (!Number.isFinite(increment) || increment <= 0) return 8;
  return Math.min(8, Math.max(0, Math.ceil(-Math.log10(increment) - 1e-9)));
}
/** Fixed decimals that follow the grouping step, so rows align and each level stays distinct. */
export function formatBookPrice(value: number | null | undefined, increment: number) {
  return value != null && Number.isFinite(value) ? value.toFixed(incrementDecimals(increment)) : '—';
}
export function formatIncrement(increment: number) {
  return increment.toFixed(incrementDecimals(increment));
}
/** Five significant digits below 1 keep sub-cent prices apart; whole-number prices keep 2–5 decimals. */
export function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  const digits = magnitude > 0 && magnitude < 1 ? Math.min(8, Math.max(2, 4 - Math.floor(Math.log10(magnitude)))) : 5;
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits });
}
export function formatSize(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 });
}
/** Spread as a share of the mid price, in percent. */
export function spreadPercent(bid: number, ask: number) {
  const mid = (bid + ask) / 2;
  return mid > 0 && Number.isFinite(mid) ? Math.abs(ask - bid) / mid * 100 : null;
}
/** Seed the ticket one grouping step clear of the pool price, so the default range is single-sided. */
export function defaultOrderPrice(side: 'buy' | 'sell', marketPrice: number | null | undefined, increment = DEFAULT_INCREMENT) {
  const step = Number.isFinite(increment) && increment > 0 ? increment : DEFAULT_INCREMENT;
  if (marketPrice == null || !Number.isFinite(marketPrice) || marketPrice <= 0) return '0.00100000';
  const price = side === 'sell' ? Math.ceil(marketPrice * 1.0005 / step) * step : Math.floor(marketPrice * 0.9995 / step) * step;
  return (price > 0 ? price : step).toFixed(8);
}
/** Share of a deposit already converted, from where the pool price sits inside the range (sqrt-price liquidity math). */
export function fillFraction(p: { minPrice: number; maxPrice: number; marketPrice: number; side: 'buy' | 'sell' }) {
  if (![p.minPrice, p.maxPrice, p.marketPrice].every(Number.isFinite) || p.minPrice <= 0 || p.maxPrice <= p.minPrice) return 0;
  const rootLo = Math.sqrt(p.minPrice), rootHi = Math.sqrt(p.maxPrice);
  const root = Math.sqrt(Math.min(p.maxPrice, Math.max(p.minPrice, p.marketPrice)));
  const fraction = p.side === 'sell' ? (root - rootLo) / (rootHi - rootLo) : (1 / root - 1 / rootHi) / (1 / rootLo - 1 / rootHi);
  return Math.min(1, Math.max(0, fraction));
}
/** Integer arithmetic keeps MAX and percentage buttons within the token balance. */
export function balanceFraction(balance: string, percent: number, decimals: number): string {
  if (!/^\d+(\.\d+)?$/.test(balance) || !Number.isInteger(percent) || percent < 0 || percent > 100) return '0';
  const [whole, fraction = ''] = balance.split('.');
  const scale = 10n ** BigInt(decimals);
  const units = BigInt(whole) * scale + BigInt(fraction.padEnd(decimals, '0').slice(0, decimals) || '0');
  const value = units * BigInt(percent) / 100n;
  const tail = (value % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${value / scale}${tail ? `.${tail}` : ''}`;
}
