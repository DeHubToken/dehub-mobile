import { apiClient } from '../libs/apiClient';
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
