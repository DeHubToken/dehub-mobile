/**
 * Client for the `justwatch` edge function, which proxies the JustWatch
 * Content Partner API. Mirrors dehubweb's src/lib/api/justwatch.ts.
 *
 * Calls go out as GET rather than through `supabase.functions.invoke` (which
 * POSTs) so the responses stay cacheable: catalogue data is identical for every
 * viewer in a country, and the function sets long Cache-Control values.
 */
import env from '../config/env';

const FN_URL = `${env.SUPABASE_URL}/functions/v1/justwatch`;

export type MonetizationType = 'flatrate' | 'buy' | 'rent' | 'free' | 'ads' | 'cinema';
export type ObjectType = 'movie' | 'show';

export interface JustWatchRank {
  rank: number | null;
  delta: number | null;
}

export interface JustWatchTitle {
  justwatchId: number | string | null;
  imdbId: string | null;
  tmdbId: number | null;
  objectType: ObjectType;
  title: string;
  originalTitle: string | null;
  year: number | null;
  runtime: number | null;
  director: string | null;
  genreIds: number[];
  shortDescription: string | null;
  poster: string | null;
  /** Country-specific JustWatch path, e.g. `/us/movie/the-pianist`. */
  fullPath: string | null;
  ranks: { daily: JustWatchRank | null; weekly: JustWatchRank | null; monthly: JustWatchRank | null } | null;
}

export interface JustWatchOffer {
  monetizationType: MonetizationType | null;
  providerId: number | null;
  presentationType: string | null;
  retailPrice: number | null;
  currency: string | null;
  /** Tracking-wrapped click URL. Attribution is encoded inside it, so it is
   *  passed through untouched and never rebuilt. */
  url: string;
}

export interface JustWatchUpcoming {
  providerId: number | null;
  releaseType: string | null;
  from: string | null;
  to: string | null;
}

export interface JustWatchTitleDetail extends JustWatchTitle {
  offers: JustWatchOffer[];
  upcoming: JustWatchUpcoming[];
}

export interface JustWatchProvider {
  id: number;
  technicalName: string | null;
  name: string;
  icon: string | null;
  monetizationTypes: string[];
}

/** The feature is not live yet: the partner token is not provisioned or the
 *  function is not deployed. Screens render the pre-launch state for it. */
export class JustWatchNotConfiguredError extends Error {
  constructor() {
    super('JustWatch is not configured');
    this.name = 'JustWatchNotConfiguredError';
  }
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${FN_URL}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  // An undeployed function answers 404; that is a deployment state, not an error.
  if (res.status === 404) throw new JustWatchNotConfiguredError();
  if (!res.ok) throw new Error(`JustWatch request failed (${res.status})`);

  const data = await res.json();
  if (data?.configured === false) throw new JustWatchNotConfiguredError();
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function searchTitles(
  query: string,
  locale: string,
  objectType: ObjectType = 'movie',
): Promise<{ results: JustWatchTitle[] }> {
  return call({ action: 'search', query, locale, object_type: objectType });
}

export function fetchTitleOffers(
  id: string,
  locale: string,
  objectType: ObjectType = 'movie',
): Promise<{ title: JustWatchTitleDetail | null }> {
  return call({ action: 'offers', id, locale, object_type: objectType, id_type: 'justwatch' });
}

export function fetchProviders(locale: string): Promise<{ providers: JustWatchProvider[] }> {
  return call({ action: 'providers', locale });
}

/** Absolute JustWatch URL for a title. Attribution links must point at the
 *  country sub-folder, which is what `fullPath` already encodes. */
export function justwatchUrl(fullPath: string | null): string {
  return fullPath ? `https://www.justwatch.com${fullPath}` : 'https://www.justwatch.com';
}

export function formatPrice(amount: number | null, currency: string | null, locale: string): string | null {
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat(locale.replace('_', '-'), { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** `film`/`series` in URLs, `movie`/`show` in the API. `show` is accepted in a
 *  URL too so an old link still resolves to the series. */
export function objectTypeFromUrl(filmType?: string | null): ObjectType {
  return filmType === 'series' || filmType === 'show' ? 'show' : 'movie';
}
