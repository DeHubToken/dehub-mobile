import { apiClient } from "../libs/api.client";

export interface MentionUser {
  username: string;
  displayName: string;
  avatarImageUrl: string;
  address: string;
  isFollowing: boolean;
  /**
   * Present only on the official AI account. The API also ranks it first among
   * its own matches, so tagging the bot is one tap rather than a scroll past
   * everyone who shares the prefix.
   */
  isAssistant?: boolean;
}

export async function mentionSearch(q: string): Promise<MentionUser[]> {
  if (!q || q.length < 1) return [];
  try {
    const res = await apiClient.get<{ result: MentionUser[] }>(
      `/users/mention_search?q=${encodeURIComponent(q)}`
    );
    return res?.result ?? [];
  } catch (e) {
    console.warn("[mentionSearch] failed", e);
    return [];
  }
}
