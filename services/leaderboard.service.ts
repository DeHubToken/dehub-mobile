import { apiClient } from '../libs/api.client';

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
