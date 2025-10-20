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
// Notification types (simplified). Adjust shape based on backend response
export interface NotificationItem {
  id: string | number;
  type: string;
  content: string;
  updatedAt?: string;
  imageUrl?: string;
  read?: boolean;
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
 */
export async function getAccount(usernameOrAddress: string) {
  const url = `/account_info/${encodeURIComponent(usernameOrAddress)}`;
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
 * Fetch unread notifications for a specific address.
 * Backend returns ONLY unread notifications when provided an address.
 */
export async function getNotifications(address: string, params?: Record<string, any>) {
  if (!address) return { success: true, data: { result: [] } } as ApiResponse<NotificationsResponse>;
  const cleaned = params
    ? Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    : {};
  const search = new URLSearchParams({ address, ...cleaned }).toString();
  const url = `/notification?${search}`;
  const response = await apiClient.get<ApiResponse<NotificationsResponse>>(url, { isAuthRequired: true });
  return response;
}

/** Mark a single notification as read (PATCH /notification/:id) */
export async function markNotificationAsRead(id: string | number) {
  if (!id) return null;
  const url = `/notification/${encodeURIComponent(String(id))}`;
  try {
    return await apiClient.patch<any>(url, {}, { isAuthRequired: true });
  } catch (e) {
    console.warn('[user.service] markNotificationAsRead error', e);
    throw e;
  }
}

/**
 * Convenience method to safely refresh current account by preferred identifier.
 * Falls back from username to walletAddress.
 */
export async function refreshAccount(currentUser: User | null) {
  if (!currentUser) return null;
  const key = currentUser.username || currentUser.walletAddress;
  if (!key) return currentUser;
  try {
    const res: any = await getAccount(key);
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

export interface LikedVideosParams { page?: number; unit?: number }

/**
 * Fetch videos liked by a viewer address.
 * Endpoint: GET /liked_videos?address=<addr>&page=<page>&unit=<unit>
 */
export async function getLikedNFTs(address: string, params?: LikedVideosParams): Promise<GetNFTsResponse> {
  if (!address) return { result: [] };
  const cleaned: Record<string, any> = Object.fromEntries(
    Object.entries({ address, page: params?.page, unit: params?.unit ?? 40 })
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const query = new URLSearchParams(cleaned as any).toString();
  const url = `/liked_videos${query ? `?${query}` : ''}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    // Normalize common shapes
    if (Array.isArray(res)) return { result: res } as GetNFTsResponse;
    if (res?.result && Array.isArray(res.result)) return res as GetNFTsResponse;
    if (Array.isArray(res?.data)) return { result: res.data } as GetNFTsResponse;
    return { result: [] };
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
