/**
 * The resolution rules, which are the part of this module that can be *wrong*
 * rather than merely empty:
 *
 * - a token borrowing a listed ticker must not inherit that listing's identity,
 *   logo and market cap — that card is what a scam is fishing for;
 * - `$NVDA` is the equity, `$BTC` is the coin, and the rule that decides has to
 *   come out the same on both clients or the same caption cards differently on a
 *   phone than on a laptop;
 * - what the composer writes into the caption depends on whether a bare ticker
 *   round-trips to the asset that was picked.
 */

import {
  composerTextFor,
  fetch24hSeries,
  resolveAddress,
  resolveTicker,
  searchAssets,
  type AssetSuggestion,
  type ResolvedAsset,
} from '../../services/asset.service';
import { supabase } from '../../services/supabase';

jest.mock('../../services/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;

const DHB = '0xD20ab1015f6a2De4a6FdDEbAB270113F689c2F7c';
const IMPOSTOR = '0x1111111111111111111111111111111111111111';

/** A DexScreener pool, with only the fields the module reads. */
function pool(over: Record<string, unknown> = {}) {
  return {
    chainId: 'base',
    dexId: 'uniswap',
    url: 'https://dexscreener.com/base/pool',
    pairAddress: '0xpool',
    baseToken: { address: DHB, name: 'DeHub', symbol: 'DHB' },
    priceUsd: '0.001',
    priceNative: '0.0000004',
    priceChange: { h24: 5 },
    volume: { h24: 12_345 },
    liquidity: { usd: 50_000 },
    ...over,
  };
}

/**
 * `fetch` is the DexScreener/GeckoTerminal transport. Routed by URL rather than
 * by call order, because the module fires its providers in parallel.
 */
function mockFetch(routes: Record<string, unknown>) {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.keys(routes).find((key) => url.includes(key));
    if (!hit) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    return Promise.resolve({ ok: true, status: 200, json: async () => routes[hit] });
  }) as unknown as typeof fetch;
}

/** Edge functions, routed by name. Anything unrouted answers like a miss. */
function mockFunctions(handlers: Record<string, unknown>) {
  mockInvoke.mockImplementation((name: string, opts: { body?: Record<string, unknown> }) => {
    const key = opts?.body?.query ? `${name}:search` : name;
    if (!(key in handlers)) return Promise.resolve({ data: null, error: null });
    return Promise.resolve({ data: handlers[key], error: null });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFunctions({});
  mockFetch({});
});

describe('resolveAddress', () => {
  it('reads the token off its best pool', async () => {
    mockFetch({ '/dex/tokens/': { pairs: [pool()] } });

    const asset = (await resolveAddress(DHB)) as ResolvedAsset;
    expect(asset).toMatchObject({
      assetClass: 'token',
      symbol: 'DHB',
      name: 'DeHub',
      price: 0.001,
      changePercent24h: 5,
      chainId: 'base',
      pairAddress: '0xpool',
    });
  });

  it('returns null when no provider indexes the address, so the card can fall back', async () => {
    mockFetch({ '/dex/tokens/': { pairs: [] } });
    expect(await resolveAddress(DHB)).toBeNull();
  });

  it('ignores pools where the address is the quote token — that price is the other asset', async () => {
    mockFetch({
      '/dex/tokens/': {
        pairs: [
          pool({
            baseToken: { address: IMPOSTOR, name: 'Wrapped Ether', symbol: 'WETH' },
            priceUsd: '3000',
          }),
          pool({ priceUsd: '0.002' }),
        ],
      },
    });

    const asset = (await resolveAddress(DHB)) as ResolvedAsset;
    expect(asset.symbol).toBe('DHB');
    expect(asset.price).toBe(0.002);
  });

  it('refuses a listed token\'s identity when the addresses disagree', async () => {
    mockFetch({
      '/dex/tokens/': {
        pairs: [pool({ baseToken: { address: IMPOSTOR, name: 'Not USDC', symbol: 'USDC' } })],
      },
    });
    mockFunctions({
      'cmc-market-cap': {
        symbol: 'USDC',
        name: 'USDC',
        logo: 'https://cmc/usdc.png',
        price: 1,
        marketCap: 40_000_000_000,
        platform: { tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
      },
    });

    const asset = (await resolveAddress(IMPOSTOR)) as ResolvedAsset;
    expect(asset.name).toBe('Not USDC');
    expect(asset.marketCap).not.toBe(40_000_000_000);
    expect(asset.logo).toBeNull();
  });

  it('takes the listing when it agrees the token lives at that address', async () => {
    mockFetch({ '/dex/tokens/': { pairs: [pool()] } });
    mockFunctions({
      'cmc-market-cap': {
        symbol: 'DHB',
        name: 'DeHub',
        logo: 'https://cmc/dhb.png',
        cmcRank: 900,
        price: 0.0011,
        marketCap: 1_100_000,
        platform: { tokenAddress: DHB },
      },
    });

    const asset = (await resolveAddress(DHB)) as ResolvedAsset;
    expect(asset.logo).toBe('https://cmc/dhb.png');
    expect(asset.price).toBe(0.0011);
    // The pool still supplies what CMC has no concept of.
    expect(asset.pairAddress).toBe('0xpool');
    expect(asset.liquidityUsd).toBe(50_000);
  });
});

describe('resolveTicker', () => {
  it('gives a ranked coin the symbol', async () => {
    mockFunctions({
      'cmc-market-cap': { symbol: 'BTC', name: 'Bitcoin', cmcRank: 1, price: 60_000 },
      'stock-quote': { found: true, symbol: 'BTC', name: 'Grayscale', instrumentType: 'ETF' },
    });

    const asset = (await resolveTicker('BTC')) as ResolvedAsset;
    expect(asset.assetClass).toBe('token');
    expect(asset.name).toBe('Bitcoin');
  });

  it('gives the equity the symbol when the only coin listed under it is a memecoin', async () => {
    mockFunctions({
      'cmc-market-cap': { symbol: 'NVDA', name: 'Nvidia Inu', cmcRank: 4200, price: 0.00001 },
      'stock-quote': {
        found: true,
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        instrumentType: 'EQUITY',
        exchange: 'NasdaqGS',
        price: 120,
      },
    });

    const asset = (await resolveTicker('NVDA')) as ResolvedAsset;
    expect(asset.assetClass).toBe('stock');
    expect(asset.name).toBe('NVIDIA Corporation');
  });

  it('falls back to the DEX market for a ticker nothing else knows', async () => {
    mockFetch({ '/dex/search': { pairs: [pool({ baseToken: { address: DHB, name: 'DeHub', symbol: 'DHB' } })] } });

    const asset = (await resolveTicker('DHB')) as ResolvedAsset;
    expect(asset.assetClass).toBe('token');
    expect(asset.address).toBe(DHB);
  });

  it('returns null when no provider has heard of it', async () => {
    expect(await resolveTicker('ZZZZQ')).toBeNull();
  });
});

describe('fetch24hSeries', () => {
  const stock: ResolvedAsset = {
    assetClass: 'stock',
    symbol: 'AAPL',
    name: 'Apple',
    logo: null,
    price: 200,
    changePercent24h: 1,
    marketCap: null,
    volume24h: null,
    liquidityUsd: null,
    currency: 'USD',
    series: [
      { time: 1, price: 199 },
      { time: 2, price: 200 },
    ],
  };

  it('uses the series the quote already carried, without another request', async () => {
    expect(await fetch24hSeries(stock)).toHaveLength(2);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('reads hourly closes off the pool for a token', async () => {
    mockFetch({
      '/ohlcv/hour': {
        data: {
          attributes: {
            // [time, open, high, low, close, volume] — the close is index 4.
            ohlcv_list: [
              [200, 1, 1, 1, 0.002, 10],
              [100, 1, 1, 1, 0.001, 10],
            ],
          },
        },
      },
    });

    const series = await fetch24hSeries({
      ...stock,
      assetClass: 'token',
      series: undefined,
      chainId: 'base',
      pairAddress: '0xpool',
    });

    expect(series).toEqual([
      { time: 100_000, price: 0.001 },
      { time: 200_000, price: 0.002 },
    ]);
  });

  it('gives up empty rather than throwing, so the card renders without a chart', async () => {
    expect(await fetch24hSeries({ ...stock, series: undefined })).toEqual([]);
  });
});

describe('searchAssets', () => {
  it('ranks an exact ticker above a longer prefix match', async () => {
    mockFunctions({
      'cmc-market-cap:search': {
        results: [
          { symbol: 'DHBX', name: 'Other', cmcRank: 50 },
          { symbol: 'DHB', name: 'DeHub', cmcRank: 900 },
        ],
      },
    });

    const results = await searchAssets('DHB');
    expect(results[0].symbol).toBe('DHB');
  });

  it('marks only the best pool for a symbol as canonical', async () => {
    mockFetch({
      '/dex/search': {
        pairs: [
          pool({
            baseToken: { address: DHB, name: 'DeHub', symbol: 'MOON' },
            volume: { h24: 900_000 },
          }),
          pool({
            chainId: 'bsc',
            baseToken: { address: IMPOSTOR, name: 'Moon Copy', symbol: 'MOON' },
            volume: { h24: 12 },
          }),
        ],
      },
    });

    const results = await searchAssets('MOON');
    const moons = results.filter((r) => r.symbol === 'MOON');
    expect(moons).toHaveLength(2);
    expect(moons[0].canonicalBySymbol).toBe(true);
    expect(moons[1].canonicalBySymbol).toBe(false);
  });

  it('answers from the built-in majors when every provider is down', async () => {
    const results = await searchAssets('AAP');
    expect(results.some((r) => r.symbol === 'AAPL')).toBe(true);
  });

  it('is empty for an empty query rather than searching for everything', async () => {
    expect(await searchAssets('  ')).toEqual([]);
  });
});

describe('composerTextFor', () => {
  const base: AssetSuggestion = {
    assetClass: 'token',
    symbol: 'MOON',
    name: 'Moon',
    logo: null,
    price: null,
    changePercent24h: null,
    canonicalBySymbol: true,
  };

  it('writes the readable ticker when a ticker resolves back to this asset', () => {
    expect(composerTextFor(base)).toBe('$MOON');
  });

  it('writes the address when it would not, because that is the only text form that survives', () => {
    expect(composerTextFor({ ...base, canonicalBySymbol: false, address: IMPOSTOR })).toBe(IMPOSTOR);
  });

  it('still writes a ticker for an asset with no address to fall back to', () => {
    expect(composerTextFor({ ...base, canonicalBySymbol: false })).toBe('$MOON');
  });
});
