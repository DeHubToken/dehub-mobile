/**
 * Pinning a post to your own profile, and who else pinned it.
 *
 * The Pinned tab already reads `/pins` (see components/Profile/PinnedRoute),
 * but nothing on mobile could put a post there — pinning was a web-only action
 * against the same backend. These two calls are the other half.
 */
import { apiClient } from "../libs";

export interface TogglePinResponse {
  status: boolean;
  pinned: boolean;
  message?: string;
}

/** Pin or unpin a post. The server decides which — it returns the new state. */
export async function togglePin(tokenId: number): Promise<TogglePinResponse> {
  if (tokenId == null) throw new Error("Token ID is required");
  return apiClient.post("/pin", { tokenId });
}

/**
 * Token ids the given account has pinned.
 *
 * `limit` is deliberately generous: this answers "is this post pinned" for
 * every card on screen, so a second page would turn a pinned post into an
 * unpinned-looking one.
 */
export async function getPinnedTokenIds(address: string, limit = 100): Promise<string[]> {
  if (!address) return [];
  const res = await apiClient.get<{ result?: any[] }>("/pins", {
    params: { address, page: 1, limit },
  });
  return (res?.result || []).map((pin: any) => String(pin?.tokenId ?? pin?.post?.tokenId));
}

export interface PinUser {
  user: {
    address: string;
    username?: string;
    displayName?: string;
    avatarImageUrl?: string;
  };
  pinnedAt: string;
}

/** How many accounts have pinned this post. */
export async function getPinCount(tokenId: number): Promise<number> {
  const res = await apiClient.get<{ count?: number }>("/pin/count", { params: { tokenId } });
  return res?.count || 0;
}

/** Who pinned this post, newest first, one page at a time. */
export async function getPinners(
  tokenId: number,
  page = 1,
  limit = 20,
): Promise<{ items: PinUser[]; pagination?: any }> {
  const res = await apiClient.get<{ result?: PinUser[]; pagination?: any }>("/pin/users", {
    params: { tokenId, page, limit },
  });
  return { items: res?.result || [], pagination: res?.pagination };
}
