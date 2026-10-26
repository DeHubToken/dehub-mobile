import { apiClient } from "../libs";

/** A post of yours still waiting for its time (GET /api/scheduled_posts). */
export interface ScheduledPost {
  tokenId: number;
  name?: string;
  description?: string;
  postType?: string;
  imageUrl?: string;
  imageUrls?: string[];
  scheduledAt: string;
}

export async function getMyScheduledPosts(): Promise<ScheduledPost[]> {
  const res = await apiClient.get<{ result: ScheduledPost[] }>("/scheduled_posts", { isAuthRequired: true });
  return res?.result || [];
}

/** Move a scheduled post, or pass "now" to publish it within a minute. */
export async function moveScheduledPost(tokenId: number, at: Date | "now"): Promise<void> {
  await apiClient.patch(`/scheduled_posts/${tokenId}`, { scheduledAt: at === "now" ? "now" : at.toISOString() }, { isAuthRequired: true });
}

export async function moveScheduledLive(streamId: string, at: Date): Promise<void> {
  await apiClient.patch(`/scheduled_posts/live/${encodeURIComponent(streamId)}`, { scheduledAt: at.toISOString() }, { isAuthRequired: true });
}

export interface FansOnline {
  /** 7 x 24, UTC, Sunday first: distinct people watching in each hour. */
  grid: number[][];
  /** "everyone" when the account had too few active followers to go on. */
  basis: "followers" | "everyone";
  followers: number;
  days: number;
}

export async function getFansOnline(): Promise<FansOnline | null> {
  const res = await apiClient.get<{ result: FansOnline }>("/scheduled_posts/fans_online", { isAuthRequired: true });
  return res?.result ?? null;
}
