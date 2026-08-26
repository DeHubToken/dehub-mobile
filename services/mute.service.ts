import { apiClient } from '../libs/api.client';

/**
 * Muting — the quiet counterpart to `block.service`.
 *
 * A mute is one-way and private: the muted account's posts leave your feeds,
 * your posts still reach them, DMs are untouched, and they are never told.
 * Blocking is bidirectional and visible on their profile.
 *
 * There is deliberately no "muted by" call and no `mutedYou` field — either
 * would let the muted account detect it, which is the one thing a mute must
 * never do.
 */

/** Item returned in the paginated mute list */
export interface MuteListItem {
  muteId: string;
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  mutedAt: string;
}

/** Paginated mute list response */
export interface MuteListResponse {
  status: boolean;
  total: number;
  page: number;
  limit: number;
  pages: number;
  items: MuteListItem[];
}

/** Response from POST /mute */
export interface MuteUserResponse {
  status: boolean;
  message: string;
  muteId: string;
  muted: {
    address: string;
    username?: string;
    displayName?: string;
  };
}

/** Response from DELETE /mute/:address */
export interface UnmuteUserResponse {
  status: boolean;
  message: string;
  address: string;
}

/** Whether YOU have muted them. There is no inverse, by design. */
export interface MuteStatus {
  status: boolean;
  youMuted: boolean;
}

/** Mute a user by wallet address. Idempotent. */
export const muteUser = (address: string): Promise<MuteUserResponse> =>
  apiClient.post<MuteUserResponse>('/mute', { address });

/** Unmute a user by wallet address. */
export const unmuteUser = (address: string): Promise<UnmuteUserResponse> =>
  apiClient.delete<UnmuteUserResponse>(`/mute/${encodeURIComponent(address)}`);

/** Paginated list of accounts you have muted. */
export const getMuteList = (page = 1, limit = 20): Promise<MuteListResponse> =>
  apiClient.get<MuteListResponse>(`/mute?page=${page}&limit=${limit}`);

/** Whether you have muted this account. */
export const getMuteStatus = (address: string): Promise<MuteStatus> =>
  apiClient.get<MuteStatus>(`/mute/status/${encodeURIComponent(address)}`);
