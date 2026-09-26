/**
 * One client-side reader for the `get-dhb-price` edge function.
 *
 * Six places need prices (badge ladder, stores, AI payments, DEX funding, pool
 * fees, tip funding) and each used to fetch on its own. They now share this
 * cache: one request per minute at most, and callers that ask while a request
 * is in flight wait on that request instead of starting another.
 */
import env from "../config/env";

export const DHB_PRICE_TTL_MS = 60_000;

export interface DhbPricePayload {
  prices?: Record<string, number>;
  price?: number;
  data?: { price?: number };
  usdPrice?: number;
  [key: string]: unknown;
}

let cached: { at: number; payload: DhbPricePayload } | null = null;
let inFlight: Promise<DhbPricePayload> | null = null;

async function request(): Promise<DhbPricePayload> {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/get-dhb-price`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
  });
  if (!res.ok) throw new Error(`Price lookup failed: ${res.status}`);
  return ((await res.json()) ?? {}) as DhbPricePayload;
}

/** The raw response, at most a minute old. Failures are not cached. */
export function getDhbPricePayload(now = Date.now()): Promise<DhbPricePayload> {
  if (cached && now - cached.at < DHB_PRICE_TTL_MS) return Promise.resolve(cached.payload);
  if (inFlight) return inFlight;
  inFlight = request()
    .then((payload) => {
      cached = { at: Date.now(), payload };
      return payload;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** USD prices keyed by symbol. Throws when the endpoint cannot be read. */
export async function getTokenPrices(): Promise<Record<string, number>> {
  return (await getDhbPricePayload()).prices ?? {};
}

export function __resetDhbPriceCacheForTests(): void {
  cached = null;
  inFlight = null;
}
