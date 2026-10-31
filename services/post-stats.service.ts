/**
 * Post stats for the creator: who a post reached (signed in and signed out),
 * by badge, how long people watched, and what they did next. Same data as the
 * web stats sheet, from /api/post-stats. Only the creator gets an answer.
 *
 * The two senders at the bottom are fire-and-forget: a stat is never worth an
 * error the person can see.
 */
import { apiClient } from "../libs";

export interface PostWatchSummary {
  plays: number;
  avgSeconds: number;
  finishedPct: number;
  /** Share of plays still going at 0%, 5% ... 100% of the video. */
  retention: number[];
  biggestDropAt: number | null;
  biggestDropPct: number;
}

export interface PostStatsBadge {
  /** -1 = no badge, otherwise the ladder index (0 Crab ... 12 Megalodon). */
  tier: number;
  name: string | null;
  people: number;
}

export interface PostStatsSupporter {
  address: string;
  username: string | null;
  displayName: string | null;
  avatarImageUrl: string | null;
  amount: number;
}

interface InOut { signedIn: number; signedOut: number }

export interface PostStats {
  tokenId: number;
  postedAt: string;
  postType?: string;
  duration: number | null;
  reach: {
    people: number;
    signedIn: number;
    signedOut: number;
    plays: number;
    playsSignedIn: number;
    playsSignedOut: number;
    repeats: number;
    totalViews: number;
    badgeWeight: number;
    agents: number;
    listens: number;
  };
  badges: PostStatsBadge[];
  devices: { ios: number; android: number; web: number; unknown: number };
  hourly: { start: string; signedIn: number[]; signedOut: number[] };
  watching: { all: PostWatchSummary | null; signedIn: PostWatchSummary | null; signedOut: PostWatchSummary | null };
  engagement: {
    likes: number;
    dislikes: number;
    comments: number;
    saves: number;
    reposts: number;
    quotes: number;
    reactions: Record<string, number>;
    shares: InOut;
    linkClicks: InOut;
    profileTaps: InOut;
  };
  followers: { gained: number; viewersWhoFollow: number; viewersNew: number };
  money: { tips: number; tippers: number; ppvBuyers: number; ppvRevenue: number; topSupporters: PostStatsSupporter[] };
  usual: { posts: number; people: number; likes: number; comments: number; reposts: number; saves: number } | null;
}

export interface BestTimes {
  days: number;
  total: number;
  /** 7 rows, Sunday first, of 24 hourly counts, in UTC. */
  grid: number[][];
}

export async function getPostStats(tokenId: string | number): Promise<PostStats> {
  const res = await apiClient.get<{ result: PostStats }>(`/post-stats/${encodeURIComponent(String(tokenId))}`, { quiet: true });
  return res.result;
}

export async function getBestTimes(): Promise<BestTimes> {
  const res = await apiClient.get<{ result: BestTimes }>("/post-stats/best-times", { quiet: true });
  return res.result;
}

/** Signed in or out: the token goes along when there is one. */
function send(path: "watch-time" | "event", body: Record<string, unknown>): void {
  apiClient.post(`/post-stats/${path}`, body, { quiet: true, timeoutMs: 10_000 }).catch(() => {});
}

export function sendWatchTime(body: { tokenId: number; sessionId: string; seconds: number; position: number; duration: number }): void {
  send("watch-time", body);
}

export type PostEventType = "share" | "link" | "profile";

export function reportPostEvent(tokenId: string | number | null | undefined, type: PostEventType): void {
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id <= 0) return;
  send("event", { tokenId: id, type });
}
