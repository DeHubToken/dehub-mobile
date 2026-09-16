import { apiClient } from '../libs/api.client';
import { supabase } from './supabase';
import env from '../config/env';
import { getAuthToken } from '../libs/auth.utils';
import { tokenRefreshManager } from '../libs/token-refresh';

export type LeaderboardSortMode =
  | 'holdings'
  | 'sentTips'
  | 'receivedTips'
  | 'followers'
  | 'likes'
  | 'subscribers';
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'year' | 'all';

export interface LeaderboardUser {
  account: string;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  /** Null when the holder hides their balance. */
  total: number | null;
  sentTips: number;
  receivedTips: number;
  followers: number;
  likes: number;
  subscribers?: number;
  badgeBalance?: number;
  badgeLock?: unknown;
  /** Change over the selected period; only on period rows. */
  delta?: number;
  hideBadgeAndBalance?: boolean;
}

export interface LeaderboardResult {
  byWalletBalance: LeaderboardUser[];
}

export interface LeaderboardData {
  result: LeaderboardResult;
  hasHistoricalData?: boolean;
}

export interface LeaderboardResponse {
  success: boolean;
  data?: LeaderboardData;
  error?: string;
}

interface CacheShape {
  data: LeaderboardData;
  timestamp: number;
}

const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes
/** sort+period → board. Bounded: six sorts by five periods would otherwise sit in memory forever. */
const MAX_MEMORY_ENTRIES = 12;
const sortCaches = new Map<string, CacheShape>();

function memoryKey(sort: string, period: string): string {
  return `${sort}:${period}`;
}

function remember(key: string, data: LeaderboardData, timestamp: number) {
  // Re-insert so the key moves to the newest position, then drop the oldest.
  sortCaches.delete(key);
  sortCaches.set(key, { data, timestamp });
  while (sortCaches.size > MAX_MEMORY_ENTRIES) {
    const oldest = sortCaches.keys().next().value;
    if (oldest === undefined) break;
    sortCaches.delete(oldest);
  }
}

/** How long to wait on the server cache before giving up and asking the API. */
const SERVER_CACHE_TIMEOUT_MS = 2500;
/** After a network-level failure, stop asking for a minute. */
const SERVER_CACHE_CIRCUIT_BREAKER_MS = 60_000;
let skipServerCacheUntil = 0;

/** The API answers in three shapes depending on the route version; read all of them. */
function normaliseEntries(raw: any): LeaderboardUser[] {
  if (Array.isArray(raw?.result)) return raw.result;
  if (Array.isArray(raw?.result?.byWalletBalance)) return raw.result.byWalletBalance;
  if (Array.isArray(raw?.data?.result?.byWalletBalance)) return raw.data.result.byWalletBalance;
  if (Array.isArray(raw)) return raw;
  return [];
}

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
 * Period rows (day/week/month/year) only exist in the cache — the API has no
 * period support — so for those a miss is an error, not an empty board.
 *
 * Cache miss or cache down for `all` falls through to the API — a
 * stale-but-complete board beats no board, and a wrong board beats neither.
 */
async function fetchServerCache(
  sort: string,
  period: LeaderboardPeriod,
  force: boolean,
): Promise<LeaderboardData | null> {
  if (!force && Date.now() < skipServerCacheUntil) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SERVER_CACHE_TIMEOUT_MS);
  try {
    const { data, error } = await supabase
      .from('leaderboard_cache')
      .select('data')
      .eq('sort_mode', sort)
      .eq('period', period)
      .abortSignal(controller.signal)
      .single();

    if (error || !data?.data) {
      if (error?.message && /network|fetch|abort|timeout/i.test(error.message)) {
        skipServerCacheUntil = Date.now() + SERVER_CACHE_CIRCUIT_BREAKER_MS;
      }
      return null;
    }
    const payload = data.data as any;
    const entries = normaliseEntries(payload);
    if (!entries.length && !Array.isArray(payload?.result?.byWalletBalance)) return null;
    return {
      result: { byWalletBalance: entries },
      hasHistoricalData: payload?.hasHistoricalData,
    };
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

export interface GetLeaderboardParams {
  sort?: LeaderboardSortMode | string;
  period?: LeaderboardPeriod;
  /** Skip the in-memory board and the circuit breaker — pull-to-refresh. */
  force?: boolean;
}

export async function getLeaderboard(params?: GetLeaderboardParams): Promise<LeaderboardResponse> {
  const { sort = 'holdings', period = 'all', force = false } = params || {};
  const now = Date.now();
  const key = memoryKey(sort, period);
  const cached = sortCaches.get(key);
  if (!force && cached && now - cached.timestamp < CACHE_DURATION) {
    return { success: true, data: cached.data };
  }

  const fromServerCache = await fetchServerCache(sort, period, force);
  if (fromServerCache) {
    remember(key, fromServerCache, now);
    return { success: true, data: fromServerCache };
  }

  if (period !== 'all') {
    // The API cannot answer a period question; an all-time board dressed as
    // "this week" would be wrong, and an empty one would read as "nobody".
    if (cached) return { success: true, data: cached.data };
    throw new Error(`Leaderboard period "${period}" is unavailable`);
  }

  try {
    const query = objectToGetParams({ sort });
    const url = `/leaderboard${query}`;
    const res: any = await apiClient.get(url, { isAuthRequired: false });
    if (res?.success === false) {
      return { success: false, error: res?.error || 'Failed to fetch leaderboard data' };
    }
    const data: LeaderboardData = {
      result: { byWalletBalance: normaliseEntries(res) },
      hasHistoricalData: true,
    };
    remember(key, data, now);
    return { success: true, data };
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    if (cached) {
      return { success: true, data: cached.data };
    }
    return { success: false, error: 'Failed to fetch leaderboard data' };
  }
}

export interface RefreshPositionResult {
  success: boolean;
  added?: boolean;
  balance?: number;
  reason?: string;
  error?: string;
}

/**
 * Ask the refresh-leaderboard-user function to re-read the caller's balance.
 *
 * The wallet comes off the verified DeHub token — no address parameter — so a
 * signed-out caller has nothing to send and gets an error before the network.
 * The server holds a ten-minute cooldown per wallet; the screen adds a
 * thirty-second one so a double tap does not burn it.
 */
export async function refreshMyLeaderboardPosition(): Promise<RefreshPositionResult> {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) throw new Error('not-authenticated');
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/refresh-leaderboard-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      'x-dehub-token': token,
    },
    body: '{}',
  });
  const result = (await res.json().catch(() => ({}))) as RefreshPositionResult;
  if (!res.ok) return { success: false, error: result?.error || `HTTP ${res.status}` };
  return result;
}
