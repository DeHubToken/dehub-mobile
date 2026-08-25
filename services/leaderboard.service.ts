import { apiClient } from '../libs/api.client';
import { supabase } from './supabase';

interface LeaderboardUser {
  account: string;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  total: number;
  sentTips: number;
  receivedTips: number;
  followers: number;
  likes: number;
}

interface LeaderboardResult {
  byWalletBalance: LeaderboardUser[];
}

export interface LeaderboardResponse {
  success: boolean;
  data?: { result: LeaderboardResult };
  error?: string;
}

interface CacheShape {
  data?: { result: LeaderboardResult };
  sort?: string;
  timestamp: number;
}

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
const sortCaches = new Map<string, CacheShape>();

/** How long to wait on the server cache before giving up and asking the API. */
const SERVER_CACHE_TIMEOUT_MS = 2500;
/** After a network-level failure, stop asking for a minute. */
const SERVER_CACHE_CIRCUIT_BREAKER_MS = 60_000;
let skipServerCacheUntil = 0;

/**
 * Holdings totals, the way the web app reads them.
 *
 * `/api/leaderboard` totals a wallet as its DHB balance plus its stake in the
 * 2022 BNB staking contract. Staking today is a transfer into a plain wallet
 * with the ledger in `staking_records`, which the API cannot see — so anyone
 * who staked has that DHB counted nowhere and drops down the board. The
 * `leaderboard_cache` rows are built by the refresh-leaderboard-cache edge
 * function, which adds the net staked back on top; web has read them for
 * months and mobile did not, which is why one wallet ranked in two places.
 *
 * Cache miss or cache down falls through to the API — a stale-but-complete
 * board beats no board, and a wrong board beats neither.
 */
async function fetchServerCache(sort: string): Promise<{ result: LeaderboardResult } | null> {
  if (Date.now() < skipServerCacheUntil) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_CACHE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('leaderboard_cache')
      .select('data')
      .eq('sort_mode', sort)
      .eq('period', 'all')
      .abortSignal(controller.signal)
      .single();

    if (error || !data?.data) {
      if (error?.message && /network|fetch|abort|timeout/i.test(error.message)) {
        skipServerCacheUntil = Date.now() + SERVER_CACHE_CIRCUIT_BREAKER_MS;
      }
      return null;
    }
    const payload = data.data as { result?: LeaderboardResult };
    return payload?.result?.byWalletBalance ? { result: payload.result } : null;
  } catch (err) {
    console.warn('[Leaderboard] server cache unavailable:', err);
    skipServerCacheUntil = Date.now() + SERVER_CACHE_CIRCUIT_BREAKER_MS;
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function objectToGetParams(obj: Record<string, any>): string {
  const params = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(String(v)))
    .join('&');
  return params ? `?${params}` : '';
}

export async function getLeaderboard(params?: { sort?: string }): Promise<LeaderboardResponse> {
  const { sort = 'holdings' } = params || {};
  const now = Date.now();
  const cached = sortCaches.get(sort);
  if (cached?.data && now - cached.timestamp < CACHE_DURATION) {
    return { success: true, data: cached.data };
  }
  const fromServerCache = await fetchServerCache(sort);
  if (fromServerCache) {
    const shaped: LeaderboardResponse = { success: true, data: fromServerCache };
    sortCaches.set(sort, { data: fromServerCache, timestamp: now, sort });
    return shaped;
  }

  try {
    const query = objectToGetParams({ sort });
    const url = `/leaderboard${query}`;
    const res: any = await apiClient.get(url, { isAuthRequired: false });
    const shaped: LeaderboardResponse = res?.success !== false
      ? { success: true, data: res }
      : { success: false, error: res?.error || 'Failed to fetch leaderboard data' };
    if (shaped.success && shaped.data) {
      sortCaches.set(sort, { data: shaped.data, timestamp: now, sort });
    }
    return shaped;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    if (cached?.data) {
      return { success: true, data: cached.data };
    }
    return { success: false, error: 'Failed to fetch leaderboard data' };
  }
}
