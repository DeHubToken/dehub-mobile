import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../libs/api.client';

const HISTORY_KEY_PREFIX = 'search_history_v2';
const MAX_HISTORY = 25;

function historyKey(address?: string): string {
  if (address) return `${HISTORY_KEY_PREFIX}:${address.toLowerCase()}`;
  return HISTORY_KEY_PREFIX;
}

export type SearchType = 'accounts' | 'content';
export type SearchPostType =
  | 'all'
  | 'video'
  | 'live'
  | 'feed-all'
  | 'feed'
  | 'feed-simple'
  | 'feed-images'
  | 'feed-audio';

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  type?: SearchType;
  postType?: SearchPostType;
}

export interface SearchAccountResult {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  aboutMe?: string;
  isPrivate?: boolean;
  followers?: number;
  followings?: number;
  badgeBalance?: number;
  createdAt?: string;
  /** Backend-provided: is the authenticated user following this account? */
  isFollowing?: boolean;
  /** Backend-provided: is there a pending follow request? */
  isFollowRequestPending?: boolean;
}

export interface SearchContentResult {
  tokenId: number;
  name?: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoDuration?: number;
  postType?: 'video' | 'live' | 'feed-simple' | 'feed-images' | 'feed-audio';
  audioUrl?: string;
  audioDuration?: number;
  listens?: number;
  views?: number;
  totalVotes?: { for?: number; against?: number };
  createdAt?: string;
  commentCount?: number;
  minterUser?: {
    address?: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    followers?: number;
    followings?: number;
    badgeBalance?: number;
    isFollowing?: boolean;
    isFollowRequestPending?: boolean;
  };
  stream?: {
    status?: string;
    playbackId?: string;
    peakViewers?: number;
    totalViews?: number;
    likes?: number;
    startedAt?: string;
    endedAt?: string;
    scheduledFor?: string;
  };
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  isOwner?: boolean;
  isUnlocked?: boolean;
  // Unified feed compatibility extras
  minter?: string;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  thumbnailUrl?: string;
  imageUrls?: string[];
  category?: string[];
  likes?: number;
  dislikes?: number;
  minterStaked?: number;
}

export interface SearchPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

// ---- Bucket (items + pagination) ----
export interface SearchBucket<T> {
  items: T[];
  pagination: SearchPagination;
}

// ---- Top-level API response ----
export interface UnifiedSearchResponse {
  status: boolean;
  accounts: SearchBucket<SearchAccountResult> | null;
  content: SearchBucket<SearchContentResult> | null;
}

const EMPTY_PAGINATION: SearchPagination = {
  page: 1,
  limit: 20,
  totalCount: 0,
  totalPages: 0,
  hasMore: false,
};

function emptyResponse(): UnifiedSearchResponse {
  return {
    status: true,
    accounts: { items: [], pagination: { ...EMPTY_PAGINATION } },
    content: { items: [], pagination: { ...EMPTY_PAGINATION } },
  };
}

/**
 * GET /api/search — Universal search.
 * Returns `{ status, accounts, content }` where each is `{ items, pagination } | null`.
 */
export async function search(params: SearchParams): Promise<UnifiedSearchResponse> {
  const { q, page = 1, limit = 20, type, postType } = params;

  if (!q?.trim()) return emptyResponse();

  const qp = new URLSearchParams();
  qp.set('q', q.trim());
  qp.set('page', String(page));
  qp.set('limit', String(limit));
  if (type) qp.set('type', type);
  if (postType && postType !== 'all') qp.set('postType', postType);

  try {
    const data = await apiClient.get<any>(`/search?${qp.toString()}`);

    return {
      status: data?.status ?? true,
      accounts: data?.accounts ?? null,
      content: data?.content ?? null,
    };
  } catch (e) {
    console.warn('[search.service] search error', e);
    return { status: false, accounts: null, content: null };
  }
}

/**
 * Search only accounts (paginated).
 */
export async function searchAccounts(
  q: string,
  options?: { page?: number; limit?: number },
): Promise<SearchBucket<SearchAccountResult>> {
  const res = await search({ q, type: 'accounts', ...options });
  return res.accounts ?? { items: [], pagination: { ...EMPTY_PAGINATION } };
}

/**
 * Search only content (paginated).
 */
export async function searchContent(
  q: string,
  options?: { page?: number; limit?: number; postType?: SearchPostType },
): Promise<SearchBucket<SearchContentResult>> {
  const res = await search({ q, type: 'content', ...options });
  return res.content ?? { items: [], pagination: { ...EMPTY_PAGINATION } };
}

export async function fetchSuggestions(q: string): Promise<string[]> {
  if (!q?.trim()) return [];
  try {
    const res = await apiClient.get<string[]>(
      `/search/suggestions?q=${encodeURIComponent(q.trim())}`,
    );
    return Array.isArray(res) ? res.slice(0, 5) : [];
  } catch (e) {
    console.warn('[search.service] fetchSuggestions error', e);
    return [];
  }
}

export async function getHistory(address?: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(historyKey(address));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.warn('[search.service] getHistory error', e);
    return [];
  }
}

export async function addToHistory(term: string, address?: string): Promise<void> {
  const t = term.trim().toLowerCase();
  if (!t) return;
  try {
    const current = await getHistory(address);
    const next = [t, ...current.filter((x) => x !== t)].slice(0, MAX_HISTORY);
    await AsyncStorage.setItem(historyKey(address), JSON.stringify(next));
  } catch (e) {
    console.warn('[search.service] addToHistory error', e);
  }
}

export async function clearHistory(address?: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(historyKey(address));
  } catch (e) {
    console.warn('[search.service] clearHistory error', e);
  }
}

export function topHistorySubset(history: string[], limit = 6): string[] {
  return history.slice(0, limit);
}
