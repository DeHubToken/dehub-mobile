import { apiClient } from '../libs/api.client';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// API Functions
// =============================================================================

/**
 * Block a user by wallet address. Idempotent.
 */
export const blockUser = (address: string, reason?: string): Promise<BlockUserResponse> =>
  apiClient.post<BlockUserResponse>('/block', { address, reason });

/**
 * Unblock a user by wallet address.
 */
export const unblockUser = (address: string): Promise<UnblockUserResponse> =>
  apiClient.delete<UnblockUserResponse>(`/block/${encodeURIComponent(address)}`);

/**
 * Get paginated list of users you have blocked.
 */
export const getBlockList = (page = 1, limit = 20): Promise<BlockListResponse> =>
  apiClient.get<BlockListResponse>(`/block?page=${page}&limit=${limit}`);

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
