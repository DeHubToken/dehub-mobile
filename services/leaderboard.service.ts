import { apiClient } from '../libs/apiClient';

interface LeaderboardUser {
  account: string;
  username?: string;
  userDisplayName?: string;
  avatarUrl?: string;
  total: number; // holdings or metric sorted by
  sentTips?: number;
  receivedTips?: number;
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
let leaderboardCache: CacheShape = { timestamp: 0 };

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
  if (leaderboardCache.data && leaderboardCache.sort === sort && now - leaderboardCache.timestamp < CACHE_DURATION) {
    return { success: true, data: leaderboardCache.data };
  }
  try {
    const query = objectToGetParams({ sort });
    const url = `/leaderboard${query}`;
    const res: any = await apiClient.get(url, { isAuthRequired: false });
    const shaped: LeaderboardResponse = res?.success !== false
      ? { success: true, data: res }
      : { success: false, error: res?.error || 'Failed to fetch leaderboard data' };
    if (shaped.success && shaped.data) {
      leaderboardCache = { data: shaped.data, timestamp: now, sort };
    }
    return shaped;
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    if (leaderboardCache.data) {
      return { success: true, data: leaderboardCache.data };
    }
    return { success: false, error: 'Failed to fetch leaderboard data' };
  }
}
