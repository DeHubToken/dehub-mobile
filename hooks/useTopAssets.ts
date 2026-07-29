/**
 * Top 100 data layer
 * ==================
 * Native port of web's use-cmc-top-100.ts + use-top-assets.ts. Same two edge
 * functions (`cmc-top-100`, `top-assets`), same fallback market caps, and the
 * same merge: crypto and traditional assets in one list sorted by market cap.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { createLogger } from "../libs/logger";

const log = createLogger("useTopAssets");

export interface CmcCoin {
  rank: number;
  id: number;
  name: string;
  symbol: string;
  price: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  volume_24h: number;
}

export interface TopAsset {
  symbol: string;
  name: string;
  type: "commodity" | "stock";
  price: number | null;
  change24h: number | null;
  marketCap: number | null;
  volume24h: number | null;
  currency: string;
}

/** Unified row shape the screen renders — crypto and non-crypto normalised. */
export interface UnifiedAsset {
  id: string;
  name: string;
  symbol: string;
  kind: "crypto" | "stock" | "commodity";
  price: number;
  change1h: number | null;
  change24h: number;
  change7d: number | null;
  marketCap: number;
  volume24h: number;
}

/** Approximate USD market caps for when Yahoo returns null. Mirrors web. */
const FALLBACK_MARKET_CAPS: Record<string, number> = {
  GOLD: 22.5e12, SILVER: 1.9e12, OIL: 3.4e12, NATGAS: 0.3e12,
  COPPER: 0.4e12, PLATINUM: 0.05e12, AAPL: 3.0e12, MSFT: 3.1e12,
  NVDA: 3.4e12, GOOGL: 2.2e12, AMZN: 2.0e12, META: 1.6e12,
  TSLA: 1.1e12, "BRK.B": 1.1e12, TSM: 0.9e12, AVGO: 0.8e12,
  LLY: 0.75e12, WMT: 0.65e12, JPM: 0.7e12, V: 0.6e12,
  MA: 0.45e12, UNH: 0.5e12, XOM: 0.45e12, JNJ: 0.38e12,
  PG: 0.4e12, HD: 0.38e12, COST: 0.4e12, NFLX: 0.35e12,
  ORCL: 0.35e12, CRM: 0.28e12, AMD: 0.25e12, PEP: 0.22e12,
  KO: 0.27e12, INTC: 0.1e12, BA: 0.12e12,
};

export function useCmcTop100() {
  return useQuery({
    queryKey: ["cmc-top-100"],
    queryFn: async (): Promise<CmcCoin[]> => {
      const { data, error } = await supabase.functions.invoke("cmc-top-100");
      if (error) {
        log.warn("cmc-top-100 failed:", error);
        throw new Error(error.message);
      }
      return (data as any)?.coins ?? [];
    },
    staleTime: 300_000,
    gcTime: 600_000,
  });
}

export function useTopAssets() {
  return useQuery({
    queryKey: ["top-assets", "v6"],
    queryFn: async (): Promise<TopAsset[]> => {
      const { data, error } = await supabase.functions.invoke("top-assets");
      if (error || !(data as any)?.assets) {
        if (error) log.warn("top-assets failed:", error);
        return [];
      }
      return ((data as any).assets as any[]).map((a) => ({
        symbol: a.symbol,
        name: a.name,
        type: a.type as "commodity" | "stock",
        price: a.price ?? null,
        change24h: a.change24h ?? null,
        marketCap: a.marketCap ?? FALLBACK_MARKET_CAPS[a.symbol] ?? null,
        volume24h: a.volume24h ?? null,
        currency: a.currency ?? "USD",
      }));
    },
    staleTime: 300_000,
    gcTime: 600_000,
    // Web polls only while its route is active; the screen owns that here.
    refetchOnMount: "always",
  });
}

/** Merge both sources into one market-cap-sorted list, as web does. */
export function mergeAssets(assets: TopAsset[] | undefined, coins: CmcCoin[] | undefined): UnifiedAsset[] {
  const out: UnifiedAsset[] = [];

  for (const a of assets ?? []) {
    // Web drops rows with neither a price nor a market cap.
    if (a.price == null && a.marketCap == null) continue;
    out.push({
      id: `asset-${a.symbol}`,
      name: a.name,
      symbol: a.symbol,
      kind: a.type,
      price: a.price ?? 0,
      change1h: null,
      change24h: a.change24h ?? 0,
      change7d: null,
      marketCap: a.marketCap ?? 0,
      volume24h: a.volume24h ?? 0,
    });
  }

  for (const c of coins ?? []) {
    out.push({
      id: `coin-${c.id}`,
      name: c.name,
      symbol: c.symbol,
      kind: "crypto",
      price: c.price,
      change1h: c.percent_change_1h,
      change24h: c.percent_change_24h,
      change7d: c.percent_change_7d,
      marketCap: c.market_cap,
      volume24h: c.volume_24h,
    });
  }

  out.sort((a, b) => b.marketCap - a.marketCap);
  return out;
}

export function formatPrice(price: number): string {
  if (price >= 1) {
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toPrecision(4)}`;
}

export function formatLargeNumber(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
