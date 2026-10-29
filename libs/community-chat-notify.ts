/**
 * Community chat notifications
 * ============================
 * Members hear about a community's chat through one grouped row per community
 * ("James + 2 others sent messages in X"), built and throttled by the DeHub API
 * (backend community-chat-notification.service.ts). Same two calls web makes:
 *
 * - report: the sender, right after a message is stored, with the signed
 *   wallet session so the API can re-read the message and the member list.
 * - seen: while the chat is on screen, on open and every minute after. It
 *   clears that community's row and holds new pings while they are reading.
 *
 * Both are fire-and-forget: a missing notification is never a failed send.
 */
import { apiClient } from "./api.client";
import { ensureWalletSession } from "./wallet-session";

export const COMMUNITY_CHAT_SEEN_INTERVAL_MS = 60_000;

export async function reportCommunityChatMessage(communityId: string, messageId: string, walletAddress: string): Promise<void> {
  try {
    const session = await ensureWalletSession(walletAddress.toLowerCase());
    if (!session) return;
    await apiClient.post(
      "/notification/community-chat",
      { communityId, messageId, walletSession: session.token },
      { isAuthRequired: true },
    );
  } catch {
    // Best effort.
  }
}

export async function markCommunityChatSeen(communityId: string): Promise<void> {
  try {
    await apiClient.post("/notification/community-chat/seen", { communityId }, { isAuthRequired: true });
  } catch {
    // Best effort: the worst case is one extra ping.
  }
}
