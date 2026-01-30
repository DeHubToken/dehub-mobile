import { apiClient } from '../libs/api.client';
import { User } from '../context/AuthContext';
import { getNFTs, GetNFTsResponse, SearchParams } from './nft.service';

// Generic API response wrapper type (adjust if project has a central type)
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

interface AccountInfoResponse { result: User }
interface UsersSearchResponse { result: User[] }

// =============================================================================
// Notification Types
// =============================================================================

/** Post type for notification content */
export type NotificationPostType = 'video' | 'feed-images' | 'feed-simple';

/** Notification type categories */
export type NotificationType = 
  | 'like' 
  | 'comment' 
  | 'comment_reply' 
  | 'following' 
  | 'tip' 
  | 'subscription' 
  | 'ppv_purchase' 
  | 'video_milestone' 
  | 'livestream_start' 
  | 'video_removal';

/** Notification category for filtering */
export type NotificationCategory = 'engagement' | 'social' | 'monetization' | 'content' | 'system';

/** Full notification item from backend */
export interface NotificationItem {
  _id: string;
  address: string;
  type: NotificationType;
  category: NotificationCategory;
  content: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
  // Actor info (who triggered the notification)
  actorAddress?: string;
  actorUsername?: string;
  actorAvatar?: string;
  // Content info
  tokenId?: number;
  tokenTitle?: string;
  tokenThumbnail?: string;
  postType?: NotificationPostType;
  // Aggregation
  aggregatedCount?: number;
  latestActorNames?: string[];
  // Monetization fields
  amount?: number;
  currency?: string;
}

/** Query params for fetching notifications */
export interface GetNotificationsParams {
  unreadOnly?: boolean;
  category?: NotificationCategory;
  page?: number;
  limit?: number;
}

interface NotificationsResponse { result: NotificationItem[] }

// Params accepted for user content queries
export interface UserContentSearchParams {
  q?: string;            // search text
  sort?: string;         // e.g. 'new', 'popular'
  type?: string;         // maps to sortMode for videos (e.g. 'trending')
  category?: string;     // category filter; 'All' is ignored
  range?: string | number; // time or other range filter
  page?: number;         // pagination page
  unit?: number;         // page size (defaults to 40)
}

/**
 * Fetch a single account (by username or address)
 * @param usernameOrAddress - The username or wallet address to look up
 * @param viewerAddress - Optional: Your wallet address to get relationship info (isFollowing, followsYou)
 */
export async function getAccount(usernameOrAddress: string, viewerAddress?: string) {
  const baseUrl = `/account_info/${encodeURIComponent(usernameOrAddress)}`;
  const url = viewerAddress ? `${baseUrl}?address=${encodeURIComponent(viewerAddress)}` : baseUrl;
  const response = await apiClient.get<ApiResponse<AccountInfoResponse>>(url, { isAuthRequired: true });
  return response;
}

/**
 * Search for users
 */
export async function usersSearch(searchParam: string) {
  const url = `/users_search?searchParam=${encodeURIComponent(searchParam)}`;
  const response = await apiClient.get<ApiResponse<UsersSearchResponse>>(url, { isAuthRequired: true });
  if (response?.success && (response as any).data?.result) {
    return {
      ...response,
      data: {
        ...response.data,
        result: response.data.result.map((user: User) => ({
          ...user,
        })),
      },
    } as typeof response;
  }
  return response;
}

/**
 * Fetch notifications for the authenticated user.
 * @param params - Optional filtering and pagination params
 */
export async function getNotifications(params?: GetNotificationsParams) {
  const cleaned: Record<string, string> = {};
  
  // unreadOnly defaults to true on backend, pass "false" string to get all
  if (params?.unreadOnly === false) {
    cleaned.unreadOnly = 'false';
  }
  if (params?.category) {
    cleaned.category = params.category;
  }
  if (params?.page !== undefined) {
    cleaned.page = String(params.page);
  }
  if (params?.limit !== undefined) {
    cleaned.limit = String(params.limit);
  }
  
  const search = new URLSearchParams(cleaned).toString();
  const url = `/notification${search ? `?${search}` : ''}`;
  const response = await apiClient.get<ApiResponse<NotificationsResponse>>(url, { isAuthRequired: true });
  return response;
}

/** Mark a single notification as read (PATCH /notification/:id) */
export async function markNotificationAsRead(notificationId: string) {
  if (!notificationId) return null;
  const url = `/notification/${encodeURIComponent(notificationId)}`;
  try {
    return await apiClient.patch<any>(url, {}, { isAuthRequired: true });
  } catch (e) {
    console.warn('[user.service] markNotificationAsRead error', e);
    throw e;
  }
}

/**
 * Mark all notifications as read.
 * @param category - Optional: Only mark notifications in this category as read
 */
export async function markAllNotificationsAsRead(category?: NotificationCategory) {
  const url = category 
    ? `/notification/mark-all-read?category=${encodeURIComponent(category)}`
    : '/notification/mark-all-read';
  try {
    const response = await apiClient.post<{ message: string; count: number }>(url, {}, { isAuthRequired: true });
    return response;
  } catch (e) {
    console.warn('[user.service] markAllNotificationsAsRead error', e);
    throw e;
  }
}

/**
 * Convenience method to safely refresh current account by preferred identifier.
 * Falls back from username to walletAddress.
 * @param currentUser - The current user to refresh
 * @param viewerAddress - Optional: Viewer's address to get relationship info
 */
export async function refreshAccount(currentUser: User | null, viewerAddress?: string) {
  if (!currentUser) return null;
  const key = currentUser.username || currentUser.walletAddress;
  if (!key) return currentUser;
  try {
    const res: any = await getAccount(key, viewerAddress);
    if (res?.success && res.data?.result) return res.data.result as User;
    return currentUser;
  } catch (e) {
    console.warn('[user.service] refreshAccount error', e);
    return currentUser;
  }
}

// ---------------- User Content (Videos & Live) ----------------

function resolveAddress(userOrAddress: User | string): string | undefined {
  if (typeof userOrAddress === 'string') return userOrAddress;
  return userOrAddress?.walletAddress || userOrAddress?.address as any;
}

/**
 * Fetch on-demand user videos (postType=video). Allows optional filtering & pagination.
 */
export async function getUserVideos(userOrAddress: User | string, params?: UserContentSearchParams): Promise<GetNFTsResponse> {
  const address = resolveAddress(userOrAddress);
  if (!address) return { result: [] };
  const searchParams: SearchParams = {
    minter: address,
    address,
    unit: params?.unit ?? 40,
    postType: 'video',
    sortMode: params?.type, // maps provided type -> sortMode used by backend
    sort: params?.sort,
    category: params?.category === 'All' ? undefined : params?.category,
    range: params?.range,
    q: params?.q,
    page: params?.page,
  };
  return getNFTs(searchParams);
}

/**
 * Fetch user live streams. Uses sortMode='live' rather than postType.
 */
export async function getUserLiveVideos(userOrAddress: User | string, params?: UserContentSearchParams): Promise<GetNFTsResponse> {
  const address = resolveAddress(userOrAddress);
  if (!address) return { result: [] };
  const searchParams: SearchParams = {
    minter: address,
    owner: address,
    address,
    unit: params?.unit ?? 40,
    sortMode: 'live',
    // page: params?.page,
  };
  return getNFTs(searchParams);
}

// ---------------- Liked Videos ----------------

export interface LikedVideosParams { page?: number; unit?: number; contentType?: 'video' | 'post' | 'all' }

/**
 * Fetch videos liked by a viewer address.
 * Endpoint: GET /liked_videos?address=<addr>&page=<page>&unit=<unit>
 */
export async function getLikedNFTs(address: string, params?: LikedVideosParams): Promise<GetNFTsResponse> {
  if (!address) return { result: [] };
  // Backend expects 1-based page and `limit`; default contentType to 'video'
  const page1 = (params?.page ?? 0) + 1;
  const limit = params?.unit ?? 40;
  const contentType = params?.contentType ?? 'video';
  const cleaned: Record<string, any> = Object.fromEntries(
    Object.entries({ address, page: page1, limit, contentType })
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const query = new URLSearchParams(cleaned as any).toString();
  const url = `/liked_videos${query ? `?${query}` : ''}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    // Expected shape: { result: { items, totalCount, page, limit, contentType } }
    const wrapper = (res?.data?.result ?? res?.result ?? res) as any;
    const items = Array.isArray(wrapper)
      ? wrapper
      : Array.isArray(wrapper?.items)
        ? wrapper.items
        : [];
    return { result: items, totalCount: wrapper?.totalCount, page: wrapper?.page, limit: wrapper?.limit } as GetNFTsResponse;
  } catch (e) {
    console.warn('[user.service] getLikedNFTs error', e);
    throw e;
  }
}

// ---------------- Follow / Unfollow ----------------

/**
 * Follow a user (follower -> following). Uses the /request_follow endpoint.
 * Endpoint (GET): /request_follow?address=<follower>&following=<target>
 */
export async function followUser(followerAddress: string, followingAddress: string) {
  const url = `/request_follow?address=${encodeURIComponent(followerAddress)}&following=${encodeURIComponent(followingAddress)}`;
  return apiClient.get<any>(url, { isAuthRequired: true });
}

/**
 * Unfollow a user. /request_follow?address=<follower>&following=<target>&unFollowing=true
 */
export async function unfollowUser(followerAddress: string, followingAddress: string) {
  const url = `/request_follow?address=${encodeURIComponent(followerAddress)}&following=${encodeURIComponent(followingAddress)}&unFollowing=true`;
  return apiClient.get<any>(url, { isAuthRequired: true });
}

// ---------------- Follow state check (lightweight) ----------------

export interface IsFollowingResult { isFollowing: boolean }

/**
 * Lightweight check if the authenticated viewer is following target.
 * Endpoint (GET, AuthGuard): /is_following?target=<targetAddress>
 */
export async function isFollowing(targetAddress: string): Promise<IsFollowingResult> {
  if (!targetAddress) return { isFollowing: false };
  const url = `/is_following?target=${encodeURIComponent(targetAddress)}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const val = (res?.result?.isFollowing ?? res?.result ?? res?.isFollowing ?? false) as boolean;
    return { isFollowing: !!val };
  } catch (e) {
    // Treat failures as not-following to keep UI permissive; follow action will still be gated
    return { isFollowing: false };
  }
}
