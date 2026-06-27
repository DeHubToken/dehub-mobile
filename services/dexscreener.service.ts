const DEXSCREENER_API = "https://api.dexscreener.com";

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string | null;
  priceNative: string;
  priceChange?: { m5?: number; h1?: number; h6?: number; h24?: number } | null;
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
  marketCap?: number;
  txns?: { h24?: { buys: number; sells: number } };
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

export interface DexScreenerSearchResult {
  pairs: DexPair[] | null;
}

/** Pick the single best pair: Base chain first → highest h24 volume → most liquidity */
function rankPairs(pairs: DexPair[]): DexPair[] {
  return [...pairs].sort((a, b) => {
    const aBase = a.chainId === "base" ? 1 : 0;
    const bBase = b.chainId === "base" ? 1 : 0;
    if (aBase !== bBase) return bBase - aBase;
    const aVol = a.volume?.h24 ?? 0;
    const bVol = b.volume?.h24 ?? 0;
    if (bVol !== aVol) return bVol - aVol;
    return (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0);
  });
}

/** Search DexScreener for a cashtag symbol (e.g. "DHB", "$DHB"). */
export async function searchDexScreener(symbol: string): Promise<DexPair | null> {
  const clean = symbol.replace(/^\$/, "").toUpperCase().trim();
  if (!clean) return null;

  try {
    const res = await fetch(
      `${DEXSCREENER_API}/latest/dex/search?q=${encodeURIComponent(clean)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data: DexScreenerSearchResult = await res.json();
    const pairs = (data.pairs ?? []).filter(
      (p) => p.baseToken.symbol.toUpperCase() === clean,
    );
    if (!pairs.length) return null;
    return rankPairs(pairs)[0];
  } catch {
    return null;
  }
}

/** Fetch OHLCV candles from GeckoTerminal for a pair address (for chart). */
export interface OhlcvCandle {
  time: number; // unix seconds
  close: number;
}

export async function fetchPairOhlcv(
  chainId: string,
  pairAddress: string,
  timeframe: "hour" | "day" = "hour",
  limit = 24,
): Promise<OhlcvCandle[]> {
  try {
    const network = mapChainToGecko(chainId);
    if (!network) return [];
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pairAddress}/ohlcv/${timeframe}?limit=${limit}&currency=usd`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const raw: number[][] = data?.data?.attributes?.ohlcv_list ?? [];
    return raw
      .map(([time, , , , close]) => ({ time, close }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

function mapChainToGecko(chainId: string): string | null {
  const map: Record<string, string> = {
    ethereum: "eth",
    base: "base",
    bsc: "bsc",
    solana: "solana",
    arbitrum: "arbitrum",
    polygon: "polygon_pos",
    avalanche: "avax",
    optimism: "optimism",
  };
  return map[chainId.toLowerCase()] ?? null;
}
