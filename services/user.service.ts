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

// Account info response - followers/followings are now just counts
interface AccountInfoResponse { result: User }
interface UsersSearchResponse { result: User[] }

// =============================================================================
// Follow List Types
// =============================================================================

/** User info returned in follow list */
export interface FollowListUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers: number;
  followings: number;
  sentTips?: number;
  receivedTips?: number;
  createdAt?: string;
}

/** Single item in follow list */
export interface FollowListItem {
  followedAt: string;
  user: FollowListUser;
}

/** Pagination info for follow list */
export interface FollowListPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

/** Response from follow_list endpoint */
export interface FollowListResponse {
  status: boolean;
  result: {
    items: FollowListItem[];
    pagination: FollowListPagination;
  };
}

/** Params for getting follow list */
export interface GetFollowListParams {
  address: string;
  type: 'followers' | 'following';
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'createdAt' | 'username' | 'displayName';
  sortOrder?: 'asc' | 'desc';
}

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
  | 'comment_like'
  | 'following' 
  | 'mention'
  | 'tip' 
  | 'subscription' 
  | 'ppv_purchase' 
  | 'bounty_available'
  | 'bounty_claimed'
  | 'video_milestone' 
  | 'livestream_start' 
  | 'new_message'
  | 'video_removal'
  | 'account_warning'
  | 'system';

/** Notification category for filtering */
export type NotificationCategory = 'engagement' | 'social' | 'monetization' | 'content' | 'messages' | 'system';

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
  // Comment info
  commentId?: string;
  parentCommentId?: string;
  // Aggregation
  aggregatedCount?: number;
  latestActorNames?: string[];
  // Monetization fields
  amount?: number;
  currency?: string;
  bountyType?: 'viewer' | 'commentor';
  // Metadata with deep link and external URLs
  metadata?: {
    deepLink?: string;
    articleUrl?: string;
    streamId?: string;
    planId?: string;
    followId?: string;
  };
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
 * Backend identifies the viewer from the auth token to return relationship info (isFollowing, followsYou).
 * @param usernameOrAddress - The username or wallet address to look up
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

// ---------------- Liked Posts ----------------

export interface PostsParams { page?: number; unit?: number; }

/**
 * Fetch posts liked by the authenticated user.
 * Endpoint: GET /liked_videos?page=<page>&limit=<limit>
 */
export async function getLikedPosts(params?: PostsParams): Promise<GetNFTsResponse> {
  const page1 = (params?.page ?? 0) + 1;
  const limit = params?.unit ?? 20;
  const query = new URLSearchParams({ page: String(page1), limit: String(limit) }).toString();
  const url = `/liked_videos?${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const wrapper = (res?.data?.result ?? res?.result ?? res) as any;
    const items = Array.isArray(wrapper) ? wrapper : Array.isArray(wrapper?.items) ? wrapper.items : [];
    const pagination = res?.data?.pagination ?? res?.pagination;
    return { result: items, totalCount: pagination?.totalCount, page: pagination?.page, hasMore: pagination?.hasMore } as GetNFTsResponse;
  } catch (e) {
    console.warn('[user.service] getLikedPosts error', e);
    throw e;
  }
}

/** @deprecated Use getLikedPosts instead */
export async function getLikedNFTs(address: string, params?: PostsParams): Promise<GetNFTsResponse> {
  return getLikedPosts(params);
}

// ---------------- My Posts ----------------

/**
 * Fetch posts created by the authenticated user.
 * Endpoint: GET /myPosts?page=<page>&limit=<limit>
 */
export async function getMyPosts(params?: PostsParams): Promise<GetNFTsResponse> {
  const page1 = (params?.page ?? 0) + 1;
  const limit = params?.unit ?? 20;
  const query = new URLSearchParams({ page: String(page1), limit: String(limit) }).toString();
  const url = `/myPosts?${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const wrapper = (res?.data?.result ?? res?.result ?? res) as any;
    const items = Array.isArray(wrapper) ? wrapper : Array.isArray(wrapper?.items) ? wrapper.items : [];
    const pagination = res?.data?.pagination ?? res?.pagination;
    return { result: items, totalCount: pagination?.totalCount, page: pagination?.page, hasMore: pagination?.hasMore } as GetNFTsResponse;
  } catch (e) {
    console.warn('[user.service] getMyPosts error', e);
    throw e;
  }
}

// ---------------- Saved Posts ----------------

/**
 * Fetch posts saved by the authenticated user.
 * Endpoint: GET /savedPosts?page=<page>&limit=<limit>
 */
export async function getSavedPosts(params?: PostsParams): Promise<GetNFTsResponse> {
  const page1 = (params?.page ?? 0) + 1;
  const limit = params?.unit ?? 20;
  const query = new URLSearchParams({ page: String(page1), limit: String(limit) }).toString();
  const url = `/savedPosts?${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const wrapper = (res?.data?.result ?? res?.result ?? res) as any;
    const items = Array.isArray(wrapper) ? wrapper : Array.isArray(wrapper?.items) ? wrapper.items : [];
    const pagination = res?.data?.pagination ?? res?.pagination;
    return { result: items, totalCount: pagination?.totalCount, page: pagination?.page, hasMore: pagination?.hasMore } as GetNFTsResponse;
  } catch (e) {
    console.warn('[user.service] getSavedPosts error', e);
    throw e;
  }
}

// ---------------- Follow List ----------------

/**
 * Get paginated follow list (followers or following) for a user.
 * Endpoint (GET): /follow_list/{address}
 */
export async function getFollowList(params: GetFollowListParams): Promise<FollowListResponse> {
  const { address, type, page = 1, limit = 20, search, sortBy, sortOrder } = params;
  const queryParams = new URLSearchParams();
  queryParams.set('type', type);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (search) queryParams.set('search', search);
  if (sortBy) queryParams.set('sortBy', sortBy);
  if (sortOrder) queryParams.set('sortOrder', sortOrder);

  const url = `/follow_list/${encodeURIComponent(address)}?${queryParams.toString()}`;
  return apiClient.get<FollowListResponse>(url, { isAuthRequired: true });
}

// ---------------- Follow / Unfollow ----------------

/**
 * Response from the follow endpoint.
 * When the target has a private account, status will be 'pending' (follow request sent).
 * When the target has a public account, status will be 'following' (instant follow).
 */
export interface FollowResponse {
  status: 'following' | 'pending' | 'unfollowed' | 'cancelled';
  isPrivateAccount?: boolean;
  wasPending?: boolean;
}

/**
 * Follow a user (follower -> following). Uses the /request_follow endpoint.
 * Endpoint (GET): /request_follow?address=<follower>&following=<target>
 *
 * Returns FollowResponse so callers can distinguish between instant follow and pending request.
 */
export async function followUser(followerAddress: string, followingAddress: string): Promise<FollowResponse> {
  const url = `/request_follow?address=${encodeURIComponent(followerAddress)}&following=${encodeURIComponent(followingAddress)}`;
  const res = await apiClient.get<any>(url, { isAuthRequired: true });
  const payload = res?.data?.result || res?.result || res;
  return {
    status: payload?.status || 'following',
    isPrivateAccount: !!payload?.isPrivateAccount,
    wasPending: !!payload?.wasPending,
  };
}

/**
 * Unfollow a user (or cancel a pending follow request).
 * Endpoint (GET): /request_follow?address=<follower>&following=<target>&unFollowing=true
 */
export async function unfollowUser(followerAddress: string, followingAddress: string): Promise<FollowResponse> {
  const url = `/request_follow?address=${encodeURIComponent(followerAddress)}&following=${encodeURIComponent(followingAddress)}&unFollowing=true`;
  const res = await apiClient.get<any>(url, { isAuthRequired: true });
  const payload = res?.data?.result || res?.result || res;
  return {
    status: payload?.status || 'unfollowed',
    isPrivateAccount: !!payload?.isPrivateAccount,
    wasPending: !!payload?.wasPending,
  };
}

// ---------------- Follow state check (lightweight) ----------------

export interface IsFollowingResult {
  isFollowing: boolean;
  isFollowRequestPending?: boolean;
}

/**
 * Lightweight check if the authenticated viewer is following target.
 * Also returns isFollowRequestPending for private accounts.
 * Endpoint (GET, AuthGuard): /is_following?target=<targetAddress>
 */
export async function isFollowing(targetAddress: string): Promise<IsFollowingResult> {
  if (!targetAddress) return { isFollowing: false, isFollowRequestPending: false };
  const url = `/is_following?target=${encodeURIComponent(targetAddress)}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const payload = res?.result || res;
    const val = (payload?.isFollowing ?? false) as boolean;
    const pending = (payload?.isFollowRequestPending ?? false) as boolean;
    return { isFollowing: !!val, isFollowRequestPending: !!pending };
  } catch (e) {
    // Treat failures as not-following to keep UI permissive
    return { isFollowing: false, isFollowRequestPending: false };
  }
}

// ---------------- Follow Requests ----------------

/** A single follow request item from the /follow-requests endpoint */
export interface FollowRequestItem {
  requestId: string;
  requestedAt: string;
  user: {
    address: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
  };
}

export interface FollowRequestsResponse {
  status: boolean;
  items: FollowRequestItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Get pending follow requests for the authenticated user.
 * Endpoint (GET): /follow-requests?page=<page>&limit=<limit>
 */
export async function getFollowRequests(page = 1, limit = 20): Promise<FollowRequestsResponse> {
  const url = `/follow-requests?page=${page}&limit=${limit}`;
  const res = await apiClient.get<any>(url, { isAuthRequired: true });
  // apiClient returns parsed JSON directly; normalize possible wrappers
  const payload = res?.data || res;
  return {
    status: !!payload?.status,
    items: Array.isArray(payload?.items) ? payload.items : [],
    pagination: payload?.pagination || { page, limit, totalCount: 0, totalPages: 0, hasMore: false },
  };
}

/**
 * Accept a follow request.
 * Endpoint (POST): /follow-requests/:requestId/accept
 */
export async function acceptFollowRequest(requestId: string) {
  const url = `/follow-requests/${encodeURIComponent(requestId)}/accept`;
  return apiClient.post<any>(url, {}, { isAuthRequired: true });
}

/**
 * Reject (decline) a follow request.
 * Endpoint (POST): /follow-requests/:requestId/reject
 */
export async function rejectFollowRequest(requestId: string) {
  const url = `/follow-requests/${encodeURIComponent(requestId)}/reject`;
  return apiClient.post<any>(url, {}, { isAuthRequired: true });
}

/**
 * Accept all pending follow requests at once.
 * Endpoint (POST): /follow-requests/accept-all
 */
export async function acceptAllFollowRequests(): Promise<{ status: boolean; message: string; accepted: number }> {
  const res = await apiClient.post<any>('/follow-requests/accept-all', {}, { isAuthRequired: true });
  return res?.data || res;
}

/**
 * Reject all pending follow requests at once.
 * Endpoint (POST): /follow-requests/reject-all
 */
export async function rejectAllFollowRequests(): Promise<{ status: boolean; message: string; rejected: number }> {
  const res = await apiClient.post<any>('/follow-requests/reject-all', {}, { isAuthRequired: true });
  return res?.data || res;
}

// ---------------- User Replies (Comments by user) ----------------

/** Author info nested inside each comment from the user comments endpoint. */
export interface UserReplyAuthor {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

/** Lightweight post context attached to each comment. */
export interface UserReplyPost {
  tokenId: number;
  name?: string;
  imageUrl?: string;
  postType?: string;
  minter?: string;
}

/** The parent comment snippet (only present when isReply=true). */
export interface UserReplyParentComment {
  id: number;
  content?: string;
  address?: string;
  author?: UserReplyAuthor;
}

/** A single comment/reply item returned by GET /users/{address}/comments. */
export interface UserReplyItem {
  id: number;
  tokenId: number;
  content: string;
  imageUrl?: string;
  gifUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  isHidden?: boolean;
  address: string;
  parentId: number | null;
  isReply: boolean;
  likeCount: number;
  isLiked: boolean;
  author: UserReplyAuthor;
  parentComment?: UserReplyParentComment;
  post: UserReplyPost;
  createdAt: string;
}

export interface UserRepliesPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface GetUserRepliesParams {
  address: string;
  page?: number;
  limit?: number;
  type?: "all" | "comment" | "reply";
}

export interface GetUserRepliesResponse {
  result: {
    items: UserReplyItem[];
    pagination: UserRepliesPagination;
  };
}

/**
 * Fetch comments/replies made by a user (the "Replies" tab).
 * Endpoint: GET /users/{address}/comments?page=<page>&limit=<limit>&type=<type>
 */
export async function getUserReplies(params: GetUserRepliesParams): Promise<GetUserRepliesResponse> {
  const { address, page = 1, limit = 20, type } = params;
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (type && type !== "all") qs.set("type", type);
  const url = `/users/${encodeURIComponent(address)}/comments?${qs.toString()}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: true });
    const wrapper = res?.data ?? res;
    // Normalise: API returns { status, result: { items, pagination } }
    const items = wrapper?.result?.items ?? wrapper?.items ?? [];
    const pagination = wrapper?.result?.pagination ?? wrapper?.pagination ?? {
      page,
      limit,
      totalCount: items.length,
      totalPages: 1,
      hasMore: false,
    };
    return { result: { items, pagination } };
  } catch (e) {
    console.warn("[user.service] getUserReplies error", e);
    throw e;
  }
}

// ---------------- Suggested Accounts ----------------

export interface SuggestedAccountMutualConnection {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export type SuggestedAccountReason =
  | "follows_you"
  | "followed_by_people_you_know"
  | "engagement_overlap"
  | "suggested";

export interface SuggestedAccount {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  aboutMe?: string;
  followers: number;
  followings: number;
  uploads: number;
  badgeBalance: number;
  isPrivate: boolean;
  createdAt: string;
  followsYou: boolean;
  mutualConnections?: SuggestedAccountMutualConnection[];
  reason: SuggestedAccountReason;
}

export interface GetSuggestedAccountsResponse {
  status: boolean;
  result: {
    items: SuggestedAccount[];
  };
}

/**
 * Fetch personalised suggested accounts to follow.
 * Endpoint: GET /suggested-accounts
 * Auth required — returns up to 10 items in random order.
 */
export async function getSuggestedAccounts(): Promise<SuggestedAccount[]> {
  try {
    const res = await apiClient.get<any>("/suggested-accounts", { isAuthRequired: true });
    const wrapper = res?.data ?? res;
    const items: SuggestedAccount[] = wrapper?.result?.items ?? wrapper?.items ?? [];
    return items;
  } catch (e) {
    console.warn("[user.service] getSuggestedAccounts error", e);
    return [];
  }
}

// ---------------- User Reposts ----------------

export interface RepostItem {
  repostId: string;
  repostedAt: string;
  tokenId: number;
  postType?: 'video' | 'feed-images' | 'feed-simple';
  /** The original post data (same shape as feed items) */
  originalPost?: any;
}

export interface GetUserRepostsParams {
  address: string;
  page?: number;
  limit?: number;
}

export interface GetUserRepostsResponse {
  result: RepostItem[];
  pagination?: { page: number; limit: number; totalCount: number; hasMore: boolean };
}

/**
 * Fetch posts reposted by a user.
 * Endpoint: GET /user/{address}/reposts?page=<page>&limit=<limit>
 * 
 * TODO: Wire up when backend endpoint is available.
 */
export async function getUserReposts(params: GetUserRepostsParams): Promise<GetUserRepostsResponse> {
  const { address, page = 1, limit = 20 } = params;
  const query = new URLSearchParams({ page: String(page), limit: String(limit) }).toString();
  const url = `/user/${encodeURIComponent(address)}/reposts?${query}`;
  try {
    const res = await apiClient.get<any>(url, { isAuthRequired: false });
    const wrapper = res?.data ?? res;
    return {
      result: Array.isArray(wrapper?.result) ? wrapper.result : [],
      pagination: wrapper?.pagination,
    };
  } catch (e) {
    console.warn('[user.service] getUserReposts error', e);
    throw e;
  }
}
