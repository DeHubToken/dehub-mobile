import { apiClient } from "../libs";

// Live posts are CREATED through POST /user_mint with postType=live (see
// hooks/useUploadLive.ts) — the mint response carries the stream entity.
// The old POST /live and /user_live_create routes no longer exist on the
// backend; this module only holds the /live/:id/* interaction calls now.

export interface ScheduledLiveItem {
  streamId: string;
  name: string;
  scheduleAt?: number | null;
  thumbnailUrl?: string | null;
}

// Fetch scheduled streams for a specific user address
export async function getUserScheduledLives(address: string): Promise<ScheduledLiveItem[]> {
  if (!address) return [];
  try {
    const res = await apiClient.get<any>(`/live/user/${encodeURIComponent(address)}/scheduled?futureOnly=false`, { isAuthRequired: true });
    const arr: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res) ? res : [];
    return arr
      // .filter((i) => i && i.scheduledFor && new Date(i.scheduledFor).getTime() > Date.now())
      .map((i) => ({
        streamId: i._id || i.streamId || i.id || String(i._id || i.streamId || i.id),
        name: i.title || i.name || '',
        scheduleAt: i.scheduledFor ? new Date(i.scheduledFor).getTime() : null,
        thumbnailUrl: i.thumbnail || i.thumbnailUrl || null,
      }));
  } catch (e) {
    console.warn('[live.service] getUserScheduledLives error', e);
    return [];
  }
}


export interface LiveStreamEntity {
  _id?: string;
  title: string;
  description?: string;
  thumbnail?: string;
  streamUrl?: string;
  streamKey: string;
  livepeerId: string;
  playbackId: string;
  status: string; // e.g. OFFLINE | LIVE | SCHEDULED
  isActive: boolean;
  startedAt?: string;
  endedAt?: string;
  scheduledFor?: string;
  categories?: string[];
  settings?: Record<string, any>;
  peakViewers?: number;
  totalViews?: number;
  likes?: number;
  likesCount?: number;
  likesRecord?: Record<string, boolean>;
  isLiked?: boolean;
  totalTips?: number;
  duration?: number;
  address: string;
  activities?: any[];
  viewers?: any[];
  meta?: Record<string, any>;
  streamDelay?: number;
  tokenId?: number;
  streamInfo?: any;
  [k: string]: any;
}

export async function getLiveStream(streamId: string) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.get<LiveStreamEntity | { result?: LiveStreamEntity }>(`/live/${encodeURIComponent(streamId)}`, { isAuthRequired: true });
}

/**
 * Every stream the platform knows about — the list web's Live tab reads.
 *
 * `page` is accepted by the route and ignored by the controller (page 2 comes
 * back identical to page 1), so `unit` is the only lever there is: ask for
 * more than the platform has and the response is the complete set.
 */
export async function getLiveVideos(params?: { unit?: number; category?: string; sortMode?: string }) {
  const query = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return apiClient.get<any>(`/live${query ? `?${query}` : ""}`, { isAuthRequired: false });
}

export async function getStreamKey(streamId: string) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.get<{ streamKey: string }>(`/live/${encodeURIComponent(streamId)}/key`, { isAuthRequired: true });
}

export async function checkIfBroadcastOwner(address: string | `0x${string}` | undefined, stream: { address?: string } | null | undefined) {
  if (!address || !stream) return false;
  return stream.address?.toLowerCase() === address.toLowerCase();
}

// Like a live stream (auth via token; body optional)
export async function likeLiveStream(streamId: string, payload: Record<string, any> = {}) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.post<any>(`/live/${encodeURIComponent(streamId)}/like`, payload, {
    isAuthRequired: true,
  });
}

// Record a live gift on backend after on-chain send succeeds
export async function recordLiveGift(streamId: string, data: any) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.post<any>(`/live/${encodeURIComponent(streamId)}/gift`, data, {
    isAuthRequired: true,
  });
}

// Update stream settings while live (PATCH /live/:streamId/settings)
export async function updateStreamSettings(
  streamId: string,
  settings: { chat?: { enabled: boolean }; minTip?: number }
) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.patch<any>(
    `/live/${encodeURIComponent(streamId)}/settings`,
    { settings },
    { isAuthRequired: true }
  );
}

// Fetch ingest URL (owner only) — GET /live/:streamId/ingesturl
export async function getIngestUrl(streamId: string) {
  if (!streamId) throw new Error('streamId required');
  return apiClient.get<{ ingestUrl: string }>(
    `/live/${encodeURIComponent(streamId)}/ingesturl`,
    { isAuthRequired: true }
  );
}

// ─── Streamer progress ────────────────────────────────────────────────────────

export type StreamerCardId =
  | "first-light"
  | "marathon"
  | "night-owl"
  | "regular"
  | "iron-streak"
  | "crowd"
  | "century"
  | "legend";

export interface StreamerProgressCard {
  id: StreamerCardId;
  earnedAt: string | null;
}

export interface StreamerRecentStream {
  streamId: string;
  title: string;
  minutes: number;
  peakViewers: number;
  endedAt: string | null;
  qualified: boolean;
}

/**
 * The streamer ladder, derived server-side from ended streams. XP is one per
 * qualifying minute; a stream only qualifies when it ran ten minutes or longer
 * with at least one viewer. Level k needs 30·k·(k+1) XP.
 */
export interface StreamerProgress {
  xp: number;
  level: number;
  nextLevelXp: number;
  levelStartXp: number;
  /** 0..1 across the current level. */
  progressToNext: number;
  qualifyingMinutes: number;
  qualifyingStreams: number;
  totalStreams: number;
  longestStreamMinutes: number;
  currentStreakWeeks: number;
  bestStreakWeeks: number;
  cards: StreamerProgressCard[];
  recent: StreamerRecentStream[];
}

export async function getStreamerProgress(address: string): Promise<StreamerProgress> {
  const res = await apiClient.get<any>(`/live/creator/${encodeURIComponent(address.toLowerCase())}/progress`);
  const body = res && typeof res === "object" && res.result && typeof res.result === "object" && "level" in res.result ? res.result : res;
  return body as StreamerProgress;
}
