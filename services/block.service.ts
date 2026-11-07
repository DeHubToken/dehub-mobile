import { apiClient } from '../libs/api.client';
import { seedBlockedAuthors, setAuthorBlocked } from '../libs/blocked-authors';

/** Item returned in the paginated block list */
export interface BlockListItem {
  blockId: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  reason?: string;
  blockedAt: string;
}

/** Paginated block list response */
export interface BlockListResponse {
  status: boolean;
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: BlockListItem[];
}

/** Block status between two users */
export interface BlockStatus {
  status: boolean;
  youBlocked: boolean;
  blockedYou: boolean;
  isBlocked: boolean;
}

/** Response from POST /block */
export interface BlockUserResponse {
  status: boolean;
  message: string;
  blockId: string;
  blocked: {
    address: string;
    username?: string;
    displayName?: string;
  };
}

/** Response from DELETE /block/:address */
export interface UnblockUserResponse {
  status: boolean;
  message: string;
  address: string;
}

/**
 * Block a user by wallet address. Idempotent.
 *
 * Every block in the app comes through here, so this is where the session's
 * blocked-authors list learns of it and their content leaves the screen.
 */
export const blockUser = async (address: string, reason?: string): Promise<BlockUserResponse> => {
  const res = await apiClient.post<BlockUserResponse>('/block', { address, reason });
  setAuthorBlocked(address, true);
  setAuthorBlocked(res?.blocked?.address, true);
  return res;
};

/**
 * Unblock a user by wallet address.
 */
export const unblockUser = async (address: string): Promise<UnblockUserResponse> => {
  const res = await apiClient.delete<UnblockUserResponse>(`/block/${encodeURIComponent(address)}`);
  setAuthorBlocked(address, false);
  setAuthorBlocked(res?.address, false);
  return res;
};

/**
 * Get paginated list of users you have blocked.
 */
export const getBlockList = async (page = 1, limit = 20): Promise<BlockListResponse> => {
  const res = await apiClient.get<BlockListResponse>(`/block?page=${page}&limit=${limit}`);
  seedBlockedAuthors(res?.items?.map((item) => item.address));
  return res;
};

/**
 * Get paginated list of users who have blocked you.
 */
export const getBlockedBy = (page = 1, limit = 20): Promise<BlockListResponse> =>
  apiClient.get<BlockListResponse>(`/block/blocked-by?page=${page}&limit=${limit}`);

/**
 * Check bidirectional block status between you and another user.
 */
export const getBlockStatus = (address: string): Promise<BlockStatus> =>
  apiClient.get<BlockStatus>(`/block/status/${encodeURIComponent(address)}`);
