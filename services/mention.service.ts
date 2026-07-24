import { apiClient } from "../libs/api.client";

export interface MentionUser {
  username: string;
  displayName: string;
  avatarImageUrl: string;
  address: string;
  isFollowing: boolean;
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
