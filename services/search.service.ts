import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../libs/api.client';

const HISTORY_KEY_PREFIX = 'search_history_v2';
const MAX_HISTORY = 25;

function historyKey(address?: string): string {
  if (address) return `${HISTORY_KEY_PREFIX}:${address.toLowerCase()}`;
  return HISTORY_KEY_PREFIX;
}

// =============================================================================
// Types - aligned with new /api/search endpoint
// =============================================================================

export type SearchType = 'accounts' | 'content';
export type SearchPostType = 'all' | 'video' | 'live' | 'feed-all' | 'feed' | 'feed-simple' | 'feed-images';

export interface SearchParams {
  q: string;
  page?: number;
  limit?: number;
  type?: SearchType;
  postType?: SearchPostType;
}

export interface SearchAccountResult {
  _id?: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  aboutMe?: string;
  isPrivate?: boolean;
  followers?: number;
  followings?: number;
  createdAt?: string;
  staked?: number;
}

export interface SearchContentResult {
  tokenId: number;
  name?: string;
  description?: string;
  imageUrl?: string;
  videoUrl?: string;
  postType?: 'video' | 'live' | 'feed-simple' | 'feed-images';
  views?: number;
  totalVotes?: { for?: number; against?: number };
  createdAt?: string;
  minterUser?: {
    address?: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    followers?: number;
    followings?: number;
    staked?: number;
  };
  minterStaked?: number;
  stream?: {
    status?: string;
    playbackId?: string;
    thumbnail?: string;
    peakViewers?: number;
    totalViews?: number;
  };
  isLiked?: boolean;
  isDisliked?: boolean;
  isSaved?: boolean;
  isFollowing?: boolean;
  commentCount?: number;
  // Additional fields for unified feed compatibility
  minter?: string;
  minterUsername?: string;
  minterDisplayName?: string;
  minterAvatarUrl?: string;
  thumbnailUrl?: string;
  imageUrls?: string[];
  category?: string[];
  likes?: number;
  dislikes?: number;
}

export interface SearchPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface SearchResponse<T> {
  status: boolean;
  result: T[];
  pagination: SearchPagination;
}

// =============================================================================
// Search API
// =============================================================================

/**
 * Unified search endpoint - searches accounts and/or content
 */
export async function search<T = SearchContentResult | SearchAccountResult>(
  params: SearchParams
): Promise<SearchResponse<T>> {
  const { q, page = 1, limit = 20, type, postType } = params;
  
  if (!q?.trim()) {
    return {
      status: true,
      result: [],
      pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0, hasMore: false }
    };
  }

  const queryParams = new URLSearchParams();
  queryParams.set('q', q.trim());
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (type) queryParams.set('type', type);
  if (postType && postType !== 'all') queryParams.set('postType', postType);

  try {
    const res = await apiClient.get<any>(`/search?${queryParams.toString()}`);
    const data = res as any;
    
    return {
      status: data?.status ?? true,
      result: data?.result || [],
      pagination: data?.pagination || {
        page,
        limit,
        totalCount: data?.result?.length || 0,
        totalPages: 1,
        hasMore: false
      }
    };
  } catch (e) {
    console.warn('[search.service] search error', e);
    return {
      status: false,
      result: [],
      pagination: { page, limit, totalCount: 0, totalPages: 0, hasMore: false }
    };
  }
}

/**
 * Search only accounts
 */
export async function searchAccounts(
  q: string,
  options?: { page?: number; limit?: number }
): Promise<SearchResponse<SearchAccountResult>> {
  return search<SearchAccountResult>({
    q,
    type: 'accounts',
    ...options
  });
}

/**
 * Search only content (videos, posts, livestreams)
 */
export async function searchContent(
  q: string,
  options?: { page?: number; limit?: number; postType?: SearchPostType }
): Promise<SearchResponse<SearchContentResult>> {
  return search<SearchContentResult>({
    q,
    type: 'content',
    ...options
  });
}

// =============================================================================
// Suggestions API
// =============================================================================

export async function fetchSuggestions(q: string): Promise<string[]> {
  if (!q?.trim()) return [];
  try {
    const res = await apiClient.get<string[]>(`/search/suggestions?q=${encodeURIComponent(q.trim())}`);
    return Array.isArray(res) ? res.slice(0, 5) : [];
  } catch (e) {
    console.warn('[search.service] fetchSuggestions error', e);
    return [];
  }
}

// =============================================================================
// Search History (local storage)
// =============================================================================

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
    const next = [t, ...current.filter(x => x !== t)].slice(0, MAX_HISTORY);
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

// =============================================================================
// Legacy exports for backwards compatibility
// =============================================================================

export interface StructuredSearchResult {
  accounts: any[];
  videos: any[];
  livestreams: any[];
}

/**
 * @deprecated Use search() instead
 */
export async function performSearch(
  q: string,
  opts?: { page?: number; unit?: number }
): Promise<{ result: StructuredSearchResult }> {
  // Call new unified endpoint
  const contentRes = await searchContent(q, {
    page: opts?.page ? opts.page + 1 : 1, // old API was 0-indexed
    limit: opts?.unit || 20,
  });

  const accountsRes = await searchAccounts(q, {
    page: opts?.page ? opts.page + 1 : 1,
    limit: opts?.unit || 20,
  });

  // Separate content into videos and livestreams
  const videos = contentRes.result.filter(
    (item) => item.postType === 'video' || (!item.postType && !item.stream?.status)
  );
  const livestreams = contentRes.result.filter(
    (item) => item.postType === 'live' || item.stream?.status
  );

  return {
    result: {
      accounts: accountsRes.result,
      videos,
      livestreams
    }
  };
}

/**
 * @deprecated Use search() with type parameter instead
 */
export async function performSearchByType(
  q: string,
  type: 'accounts' | 'videos' | 'livestreams',
  opts?: { page?: number; unit?: number }
): Promise<StructuredSearchResult> {
  if (type === 'accounts') {
    const res = await searchAccounts(q, {
      page: opts?.page ? opts.page + 1 : 1,
      limit: opts?.unit || 20,
    });
    return { accounts: res.result, videos: [], livestreams: [] };
  }

  const postType = type === 'livestreams' ? 'live' : 'video';
  const res = await searchContent(q, {
    page: opts?.page ? opts.page + 1 : 1,
    limit: opts?.unit || 20,
    postType,
  });

  return {
    accounts: [],
    videos: type === 'videos' ? res.result : [],
    livestreams: type === 'livestreams' ? res.result : []
  };
}
