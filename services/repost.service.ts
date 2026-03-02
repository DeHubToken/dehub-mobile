import { apiClient } from "../libs";


export interface ToggleRepostResponse {
  status: boolean;
  reposted: boolean;
  repostCount: number;
  message: string;
}

export interface GetUserRepostsParams {
  address: string;
  page?: number;
  limit?: number;
}

export interface GetUserRepostsResponse {
  result: any[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    hasMore: boolean;
  };
}


/**
 * Toggle repost on a post. If already reposted, removes the repost.
 * Endpoint: POST /repost
 */
export async function toggleRepost(tokenId: number): Promise<ToggleRepostResponse> {
  try {
    const res = await apiClient.post<ToggleRepostResponse>("/repost", { tokenId }, { isAuthRequired: true });
    const data = (res as any)?.data ?? res;
    return data;
  } catch (e) {
    console.error("[repost.service] toggleRepost error", e);
    throw e;
  }
}

/**
 * Get posts reposted by a user (paginated with full token data).
 * Endpoint: GET /reposts?address={address}&page={page}&limit={limit}
 */
export async function getUserReposts(params: GetUserRepostsParams): Promise<GetUserRepostsResponse> {
  const { address, page = 1, limit = 20 } = params;
  const query = new URLSearchParams({
    address,
    page: String(page),
    limit: String(limit),
  }).toString();

  try {
    const res = await apiClient.get<any>(`/reposts?${query}`, {
      isAuthRequired: true,
    });
    const wrapper = res?.data ?? res;
    return {
      result: Array.isArray(wrapper?.result) ? wrapper.result : [],
      pagination: wrapper?.pagination,
    };
  } catch (e) {
    console.error("[repost.service] getUserReposts error", e);
    throw e;
  }
}


export interface RepostUserRaw {
  address: string;
  repostedAt?: string;
  isFollowing?: boolean;
  user?: {
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
    avatarUrl?: string;
    followers?: number;
    address?: string;
  };
}

/** Normalised repost-user (flat shape expected by the UI row). */
export interface RepostUser {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  repostedAt?: string;
}

/** Map the raw API shape into the flat UI shape. */
function normaliseRepostUser(raw: RepostUserRaw): RepostUser {
  const u = raw.user;
  return {
    address: u?.address || raw.address,
    username: u?.username,
    displayName: u?.displayName,
    avatarImageUrl: u?.avatarImageUrl || u?.avatarUrl,
    followers: u?.followers,
    repostedAt: raw.repostedAt,
  };
}

export interface GetRepostUsersParams {
  tokenId: number | string;
  page?: number;
  limit?: number;
}

export interface GetRepostUsersResponse {
  result: RepostUser[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    hasMore: boolean;
  };
}

/**
 * Get users who reposted a specific post (paginated).
 * Endpoint: GET /repost/users?tokenId={tokenId}&page={page}&limit={limit}
 */
export async function getRepostUsers(params: GetRepostUsersParams): Promise<GetRepostUsersResponse> {
  const { tokenId, page = 1, limit = 20 } = params;
  const query = new URLSearchParams({
    tokenId: String(tokenId),
    page: String(page),
    limit: String(limit),
  }).toString();

  try {
    const res = await apiClient.get<any>(`/repost/users?${query}`, {
      isAuthRequired: true,
    });
    const wrapper = res?.data ?? res;
    const rawItems: RepostUserRaw[] = Array.isArray(wrapper?.result) ? wrapper.result : [];
    return {
      result: rawItems.map(normaliseRepostUser),
      pagination: wrapper?.pagination,
    };
  } catch (e) {
    console.error("[repost.service] getRepostUsers error", e);
    throw e;
  }
}

export interface GetQuotePostsParams {
  tokenId: number | string;
  page?: number;
  limit?: number;
}

export interface GetQuotePostsResponse {
  result: any[];
  pagination?: {
    page: number;
    limit: number;
    totalCount: number;
    hasMore: boolean;
  };
}

/**
 * Create a quote post (new minted token referencing another post).
 * Endpoint: POST /quote_post (multipart/form-data)
 *
 * Returns mint signature to complete on-chain mint (same 2-step as user_mint).
 */
export interface CreateQuotePostResponse {
  r: string;
  s: string;
  v: number;
  createdTokenId: string | number;
  timestamp: number;
  quotedTokenId: number;
  isQuotePost: boolean;
}

export async function createQuotePost(formData: FormData): Promise<CreateQuotePostResponse> {
  try {
    const res = await apiClient.post<CreateQuotePostResponse>("/quote_post", formData, {
      isAuthRequired: true,
    });
    const data = (res as any)?.data ?? res;
    return data;
  } catch (e) {
    console.error("[repost.service] createQuotePost error", e);
    throw e;
  }
}

/**
 * Get quote posts for a specific post (paginated).
 * Endpoint: GET /quotes?tokenId={tokenId}&page={page}&limit={limit}
 */
export async function getQuotePosts(params: GetQuotePostsParams): Promise<GetQuotePostsResponse> {
  const { tokenId, page = 1, limit = 20 } = params;
  const query = new URLSearchParams({
    tokenId: String(tokenId),
    page: String(page),
    limit: String(limit),
  }).toString();

  try {
    const res = await apiClient.get<any>(`/quotes?${query}`, {
      isAuthRequired: true,
    });
    const wrapper = res?.data ?? res;
    return {
      result: Array.isArray(wrapper?.result) ? wrapper.result : [],
      pagination: wrapper?.pagination,
    };
  } catch (e) {
    console.error("[repost.service] getQuotePosts error", e);
    throw e;
  }
}
