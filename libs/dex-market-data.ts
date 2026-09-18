export type ChartPeriod = '1D' | '1W' | '1M';
export interface PricePoint { time: number; price: number; sources: number }
export interface MarketData {
  points: PricePoint[]; price: number | null; change: number | null; volume: number;
  sources: { name: string; url: string }[]; partial: boolean; updatedAt: number;
}
const NETWORKS = [
  { id: 'base', name: 'Base', token: '0xd20ab1015f6a2de4a6fddebab270113f689c2f7c' },
  { id: 'bsc', name: 'BNB', token: '0x680d3113caf77b61b510f332d5ef4cf5b41a761d' },
];
const API = 'https://api.geckoterminal.com/api/v2';
const cache = new Map<ChartPeriod, MarketData>();
type Pool = { attributes: { address: string; reserve_in_usd: string; token_price_usd: string;
  price_change_percentage: { h24: string }; volume_usd: { h24: string } };
  relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } } } };
async function json(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Market data unavailable (${response.status})`);
    return await response.json();
  } finally { clearTimeout(timer); }
}
/** Reference closes use fixed liquidity weights per response, with coverage per point.
 * Missing history is never replaced with invented candles or a flat synthetic series.
 */
export async function fetchMarketData(period: ChartPeriod): Promise<MarketData> {
  const cached = cache.get(period);
  if (cached && Date.now() - cached.updatedAt < 60000) return cached;
  const results = await Promise.allSettled(NETWORKS.map(async (network) => {
    const response = await json(`${API}/networks/${network.id}/tokens/${network.token}/pools?page=1`);
    const pools = (response.data as Pool[] || []).filter((p) =>
      [p.relationships?.base_token?.data?.id, p.relationships?.quote_token?.data?.id]
        .includes(`${network.id}_${network.token}`) && Number(p.attributes.reserve_in_usd) > 0);
    const pool = pools.sort((a, b) => Number(b.attributes.reserve_in_usd) - Number(a.attributes.reserve_in_usd))[0];
    if (!pool) throw new Error('No indexed DHB pool');
    const interval = period === '1M' ? 'day' : 'hour';
    const limit = period === '1M' ? 30 : period === '1W' ? 168 : 24;
    const series = await json(`${API}/networks/${network.id}/pools/${pool.attributes.address}/ohlcv/${interval}?limit=${limit}&currency=usd&token=${network.token}`);
    const cutoff = Date.now() / 1000 - limit * (interval === 'day' ? 86400 : 3600);
    const points = (series.data?.attributes?.ohlcv_list as number[][] || [])
      .filter((row) => row.length >= 6 && Number.isFinite(row[0]) && row[0] >= cutoff && row[0] <= Date.now() / 1000 && Number.isFinite(row[4]) && row[4] > 0)
      .map((row) => ({ time: row[0], price: row[4] }));
    if (!points.length) throw new Error('No recent chart data');
    return { network, pool, points, weight: Number(pool.attributes.reserve_in_usd) };
  }));
  const sources = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  if (!sources.length) throw new Error('Market chart is temporarily unavailable. The order book remains available.');
  const buckets = new Map<number, { sum: number; weight: number; sources: number }>();
  for (const source of sources) for (const point of source.points) {
    const bucket = buckets.get(point.time) || { sum: 0, weight: 0, sources: 0 };
    bucket.sum += point.price * source.weight; bucket.weight += source.weight; bucket.sources++;
    buckets.set(point.time, bucket);
  }
  const points = [...buckets].sort(([a], [b]) => a - b)
    .map(([time, bucket]) => ({ time, price: bucket.sum / bucket.weight, sources: bucket.sources }));
  const weight = sources.reduce((sum, source) => sum + source.weight, 0);
  const price = sources.reduce((sum, source) => sum + Number(source.pool.attributes.token_price_usd) * source.weight, 0) / weight;
  const previous = sources.reduce((sum, source) => sum + Number(source.pool.attributes.token_price_usd) /
    (1 + Number(source.pool.attributes.price_change_percentage?.h24 || 0) / 100) * source.weight, 0) / weight;
  const result: MarketData = {
    points, price: Number.isFinite(price) && price > 0 ? price : null,
    change: previous > 0 ? (price / previous - 1) * 100 : null,
    volume: sources.reduce((sum, source) => sum + (Number(source.pool.attributes.volume_usd?.h24) || 0), 0),
    sources: sources.map((source) => ({ name: source.network.name,
      url: `https://www.geckoterminal.com/${source.network.id}/pools/${source.pool.attributes.address}` })),
    partial: sources.length < NETWORKS.length || points.some((point) => point.sources < NETWORKS.length), updatedAt: Date.now(),
  };
  cache.set(period, result); return result;
}
