export interface BookPosition {
  side: 'buy' | 'sell';
  minPrice: number;
  maxPrice: number;
  amountDhb: number;
  amountUsdc: number;
}

export interface BookLevel {
  price: number;
  dhb: number;
  usdc: number;
  orders: number;
  cumulativeDhb: number;
}

function levels(positions: BookPosition[], side: 'buy' | 'sell'): BookLevel[] {
  const grouped = new Map<string, BookLevel>();
  for (const position of positions) {
    if (position.side !== side) continue;
    const price = side === 'buy' ? position.maxPrice : position.minPrice;
    const dhb = side === 'buy' ? position.amountUsdc / price : position.amountDhb;
    const usdc = side === 'buy' ? position.amountUsdc : position.amountDhb * price;
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(dhb) || dhb <= 0) continue;
    const key = price.toFixed(8);
    const existing = grouped.get(key) ?? { price: Number(key), dhb: 0, usdc: 0, orders: 0, cumulativeDhb: 0 };
    existing.dhb += dhb;
    existing.usdc += usdc;
    existing.orders += 1;
    grouped.set(key, existing);
  }
  const sorted = [...grouped.values()].sort((a, b) => side === 'buy' ? b.price - a.price : a.price - b.price);
  let cumulativeDhb = 0;
  return sorted.map((level) => ({ ...level, cumulativeDhb: (cumulativeDhb += level.dhb) }));
}

export function aggregateBook(positions: BookPosition[]) {
  return { bids: levels(positions, 'buy'), asks: levels(positions, 'sell') };
}
