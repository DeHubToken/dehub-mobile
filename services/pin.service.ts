/**
 * Pinning a post to your own profile.
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
