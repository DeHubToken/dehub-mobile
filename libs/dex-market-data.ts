/**
 * Price, chart and stats for a community pool's token, from public market data.
 *
 * The DHB book samples its own pools every minute server-side. A community
 * pool can be any token on four chains, so it reads the market the way a
 * trader would: DexScreener for the live price, 24h change, liquidity and
 * volume across every pair, and GeckoTerminal for candles of the deepest pair.
 * Both are keyless; GeckoTerminal allows ~30 calls a minute, so
 * candles are cached per pool and interval for a minute.
 */
import type { Candle, CandleInterval } from './dex-live-market';
import type { PoolChain } from './dex-pools';

const GECKO_NETWORK: Record<PoolChain, string> = { base: 'base', ethereum: 'eth', robinhood: 'robinhood', solana: 'solana' };
const SCREENER_CHAIN: Record<PoolChain, string> = { base: 'base', ethereum: 'ethereum', robinhood: 'robinhood', solana: 'solana' };
const GECKO_TIMEFRAME: Record<CandleInterval, [string, number]> = {
  '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '30m': ['minute', 15], '1h': ['hour', 1],
};

export interface TokenMarket {
  priceUsd: number | null;
  change24h: number | null;
  liquidityUsd: number | null;
  volume24h: number | null;
  marketCap: number | null;
  /** The deepest pair, which the chart follows. */
  pairAddress: string | null;
  imageUrl: string | null;
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function tokenMarket(chain: PoolChain, token: string): Promise<TokenMarket> {
  const res = await fetch(`https://api.dexscreener.com/tokens/v1/${SCREENER_CHAIN[chain]}/${token}`);
  const pairs = res.ok ? await res.json() as {
    pairAddress: string; priceUsd?: string; priceNative?: string; baseToken: { address: string }; quoteToken: { address: string };
    priceChange?: { h24?: number }; liquidity?: { usd?: number }; volume?: { h24?: number }; marketCap?: number; fdv?: number; info?: { imageUrl?: string };
  }[] : [];
  if (!Array.isArray(pairs) || !pairs.length) return { priceUsd: null, change24h: null, liquidityUsd: null, volume24h: null, marketCap: null, pairAddress: null, imageUrl: null };
  const sorted = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  // Pairs where the token is the base carry its own USD price; a quote-side pair prices the other token.
  const priced = sorted.find((p) => same(p.baseToken.address, token) && Number(p.priceUsd) > 0);
  return {
    priceUsd: priced ? Number(priced.priceUsd) : null,
    change24h: priced?.priceChange?.h24 ?? null,
    liquidityUsd: sorted.reduce((sum, p) => sum + (p.liquidity?.usd ?? 0), 0) || null,
    volume24h: sorted.reduce((sum, p) => sum + (p.volume?.h24 ?? 0), 0) || null,
    marketCap: priced?.marketCap ?? priced?.fdv ?? null,
    pairAddress: (priced ?? sorted[0]).pairAddress ?? null,
    imageUrl: sorted.find((p) => p.info?.imageUrl)?.info?.imageUrl ?? null,
  };
}

const candleCache = new Map<string, { at: number; candles: Candle[] }>();

/** Candles for the token in USD, oldest first. Empty when no pair is charted yet. */
export async function tokenCandles(chain: PoolChain, pairAddress: string, token: string, interval: CandleInterval): Promise<Candle[]> {
  const key = `${chain}:${pairAddress}:${interval}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.candles;
  const [timeframe, aggregate] = GECKO_TIMEFRAME[interval];
  const params = `aggregate=${aggregate}&limit=200&currency=usd&token=${token}`;
  const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${GECKO_NETWORK[chain]}/pools/${pairAddress}/ohlcv/${timeframe}?${params}`,
    { headers: { accept: 'application/json' } });
  if (!res.ok) return hit?.candles ?? [];
  const json = await res.json() as { data?: { attributes?: { ohlcv_list?: number[][] } } };
  const now = Math.floor(Date.now() / 1000);
  const candles = (json.data?.attributes?.ohlcv_list ?? [])
    .map(([time, open, high, low, close]) => ({ time, open, high, low, close, observedAt: now }))
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite) && c.low > 0)
    .sort((a, b) => a.time - b.time);
  candleCache.set(key, { at: Date.now(), candles });
  return candles;
}

/** Four grouping steps around a price, finest first, so any token's book reads at a sensible scale. */
export function incrementsFor(price: number | null | undefined): number[] {
  if (!price || !Number.isFinite(price) || price <= 0) return [0.00000001, 0.0000001, 0.000001, 0.00001];
  const top = Math.floor(Math.log10(price)) - 2;
  return [top - 3, top - 2, top - 1, top].map((e) => Number(Math.pow(10, e).toPrecision(1)));
}
