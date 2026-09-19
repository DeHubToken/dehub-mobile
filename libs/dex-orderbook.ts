export interface BookPosition {
  minPrice: number; maxPrice: number; marketPrice: number; amountDhb: number; amountUsdc: number;
}
export interface BookLevel { price: number; dhb: number; usdc: number; cumulativeDhb: number }

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
export function formatPrice(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—';
}
export function formatSize(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: value < 1 ? 6 : 2 });
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
