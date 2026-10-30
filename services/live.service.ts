import { apiClient } from "../libs";
import { parseControls, parseSubathon, type OverlayControls, type PublicOverlay } from "../libs/live-overlay/types";
import type { LiveRule } from "../libs/live-overlay/rules";
import { parsePoll, type LivePoll } from "../libs/live-overlay/polls";

// Live posts are CREATED through POST /user_mint with postType=live (see
// hooks/useUploadLive.ts) — the mint response carries the stream entity.
// The old POST /live and /user_live_create routes no longer exist on the
// backend; this module only holds the /live/:id/* interaction calls now.

export interface ScheduledLiveItem {
  streamId: string;
  name: string;
  scheduleAt?: number | null;
  thumbnailUrl?: string | null;
  /** The Live's post; deleting it calls the Live off. */
  tokenId?: number | null;
}

// Fetch scheduled streams for a specific user address
export async function getUserScheduledLives(address: string): Promise<ScheduledLiveItem[]> {
  if (!address) return [];
  try {
    const res = await apiClient.get<any>(`/live/user/${encodeURIComponent(address)}/scheduled?futureOnly=false`, { isAuthRequired: true });
    const arr: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res) ? res : [];
    return arr
      .filter((i) => i && String(i.status).toUpperCase() === "SCHEDULED")
      .map((i) => ({
        streamId: i._id || i.streamId || i.id || String(i._id || i.streamId || i.id),
        name: i.title || i.name || '',
        scheduleAt: i.scheduledFor ? new Date(i.scheduledFor).getTime() : null,
        thumbnailUrl: i.thumbnail || i.thumbnailUrl || null,
        tokenId: i.tokenId == null ? null : Number(i.tokenId),
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
  if (!/^[a-f\d]{24}$/i.test(streamId)) throw new Error('Invalid stream id');
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

/**
 * Move a stream that never got on air off the self-hosted ingest and onto
 * Livepeer, keeping its post (owner only). The publisher calls this when every
 * route to the self-hosted server has failed before any media flowed, and
 * republishes with what comes back — the creator never has to start over.
 */
export async function fallbackToLivepeer(streamId: string) {
  if (!streamId) throw new Error('streamId required');
  const res: any = await apiClient.post<any>(
    `/live/${encodeURIComponent(streamId)}/ingest-fallback`,
    {},
    { isAuthRequired: true },
  );
  const body = res?.result ?? res;
  return body as {
    provider: string;
    playbackId: string;
    streamKey: string;
    livepeerId?: string;
    ingestUrl?: string;
  };
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

export type StreamerCardId = import("../libs/streamer-badge-art").StreamerBadgeId;

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
  selectedBadgeId?: StreamerCardId | null;
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
  // collection=20 asks for the twenty-card set web shows.
  const res = await apiClient.get<any>(`/live/creator/${encodeURIComponent(address.toLowerCase())}/progress`, {
    params: { collection: "20" },
  });
  const body = res && typeof res === "object" && res.result && typeof res.result === "object" && "level" in res.result ? res.result : res;
  return body as StreamerProgress;
}

/** Equip one of the viewer's earned cards as their streamer badge. */
export function selectStreamerBadge(badgeId: StreamerCardId): Promise<{ selectedBadgeId: StreamerCardId }> {
  return apiClient.patch<{ selectedBadgeId: StreamerCardId }>("/live/creator/badge", { badgeId });
}

/** One face in the live room's "Who's here" sheet. */
export interface LiveAudienceAccount {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  badgeBalance?: number;
  hideBadgeAndBalance?: boolean;
}

/**
 * GET /live-overlay/stream/:streamId — the creator's overlay for a stream: the
 * widgets to draw over it and the numbers its goals start from. An empty
 * overlay when the creator set none up.
 */
export async function getStreamOverlay(streamId: string): Promise<PublicOverlay> {
  if (!streamId) throw new Error("streamId required");
  const res: any = await apiClient.get<any>(`/live-overlay/stream/${encodeURIComponent(streamId)}`, {
    isAuthRequired: false,
  });
  const body = res?.result ?? res?.data ?? res;
  return {
    renderIn: body?.renderIn === "video" ? "video" : "app",
    widgets: Array.isArray(body?.widgets) ? body.widgets : [],
    version: Number(body?.version) || 0,
    stats: {
      totalTips: Number(body?.stats?.totalTips) || 0,
      followers: Number(body?.stats?.followers) || 0,
      startedAt: typeof body?.stats?.startedAt === "string" ? body.stats.startedAt : null,
      reactions: Number(body?.stats?.reactions) || 0,
    },
    controls: parseControls(body?.controls),
    subathon: parseSubathon(body?.subathon),
  };
}

/** The creator's own overlay, as Live Studio edits it. */
export interface CreatorOverlay {
  token: string;
  renderIn: "app" | "video";
  widgets: PublicOverlay["widgets"];
  version: number;
  /** An OBS page with this overlay's link checked in within the last ninety seconds. */
  obsConnected: boolean;
  controls: OverlayControls;
}

function creatorOverlay(raw: any): CreatorOverlay {
  const body = raw?.result ?? raw?.data ?? raw;
  return {
    token: String(body?.token || ""),
    renderIn: body?.renderIn === "video" ? "video" : "app",
    widgets: Array.isArray(body?.widgets) ? body.widgets : [],
    version: Number(body?.version) || 0,
    obsConnected: !!body?.obsConnected,
    controls: parseControls(body?.controls),
  };
}

export async function getMyOverlay(): Promise<CreatorOverlay> {
  return creatorOverlay(await apiClient.get<any>("/live-overlay/mine", { isAuthRequired: true }));
}

export async function saveMyOverlay(overlay: Pick<CreatorOverlay, "renderIn" | "widgets">): Promise<CreatorOverlay> {
  return creatorOverlay(
    await apiClient.put<any>("/live-overlay/mine", { renderIn: overlay.renderIn, widgets: overlay.widgets }, { isAuthRequired: true }),
  );
}

/** Retire the OBS link and issue a new one. Anything still open on the old link goes blank. */
export async function rotateOverlayToken(): Promise<CreatorOverlay> {
  return creatorOverlay(await apiClient.post<any>("/live-overlay/mine/rotate", {}, { isAuthRequired: true }));
}

export type OverlayTestKind = "tip" | "follow" | "subscribe" | "share" | "join";

/** A pretend alert for the creator's own screens. Never reaches viewers. */
export async function sendOverlayTest(kind: OverlayTestKind, extra: { amount?: number; message?: string } = {}): Promise<void> {
  await apiClient.post<any>("/live-overlay/mine/test", { kind, ...extra }, { isAuthRequired: true });
}

export interface MyRules {
  rules: LiveRule[];
  version: number;
}

function myRules(res: any): MyRules {
  const body = res?.result ?? res?.data ?? res;
  return { rules: Array.isArray(body?.rules) ? body.rules : [], version: Number(body?.version) || 0 };
}

/** The creator's stream rules. Webhook addresses are in here, so this is never public. */
export async function getMyRules(): Promise<MyRules> {
  return myRules(await apiClient.get<any>("/live-overlay/mine/rules", { isAuthRequired: true }));
}

export async function saveMyRules(rules: LiveRule[]): Promise<MyRules> {
  return myRules(await apiClient.put<any>("/live-overlay/mine/rules", { rules }, { isAuthRequired: true }));
}

/** Plays one saved rule's alerts, sounds and read-aloud on the creator's own screens. */
export async function testRule(ruleId: string): Promise<void> {
  await apiClient.post<any>(`/live-overlay/mine/rules/${encodeURIComponent(ruleId)}/test`, {}, { isAuthRequired: true });
}

/** GET /live/:streamId/audience — host, who is watching, top tippers, most active chatters. */
export interface LiveAudience {
  host: (LiveAudienceAccount & { startedAt?: string | null }) | null;
  watching: number;
  here: (LiveAudienceAccount & { joinedAt: string })[];
  topTippers: (LiveAudienceAccount & { total: number; count: number })[];
  mostActive: (LiveAudienceAccount & { messages: number })[];
}

export async function getStreamAudience(streamId: string): Promise<LiveAudience> {
  if (!streamId) throw new Error('streamId required');
  const res: any = await apiClient.get<any>(`/live/${encodeURIComponent(streamId)}/audience`, { isAuthRequired: false });
  const body = res?.result ?? res?.data ?? res;
  return {
    host: body?.host ?? null,
    watching: Number(body?.watching) || 0,
    here: Array.isArray(body?.here) ? body.here : [],
    topTippers: Array.isArray(body?.topTippers) ? body.topTippers : [],
    mostActive: Array.isArray(body?.mostActive) ? body.mostActive : [],
  };
}

function pollOf(res: any): LivePoll | null {
  const body = res?.result ?? res?.data ?? res;
  return parsePoll(body?.poll);
}

/** The poll a viewer opening the stream should see: an open one, or a result that just finished. */
export async function getStreamPoll(streamId: string): Promise<LivePoll | null> {
  if (!streamId) return null;
  return pollOf(await apiClient.get<any>(`/live-overlay/stream/${encodeURIComponent(streamId)}/poll`, { isAuthRequired: false }));
}

/** One vote per person. Voting again answers with the first choice, which is the one that counts. */
export async function voteInPoll(streamId: string, pollId: string, option: number): Promise<{ poll: LivePoll | null; myVote: number }> {
  const res: any = await apiClient.post<any>(
    `/live-overlay/stream/${encodeURIComponent(streamId)}/poll/vote`,
    { pollId, option },
    { isAuthRequired: true },
  );
  const body = res?.result ?? res?.data ?? res;
  return { poll: parsePoll(body?.poll), myVote: Number.isInteger(body?.myVote) ? Number(body.myVote) : option };
}

/** The creator's latest poll, open or finished. */
export async function getMyPoll(): Promise<LivePoll | null> {
  return pollOf(await apiClient.get<any>("/live-overlay/mine/poll", { isAuthRequired: true }));
}

/** Asks the room a question on the creator's live stream. Replaces a poll that is still open. */
export async function startPoll(draft: { question: string; options: string[]; durationSec: number }): Promise<LivePoll | null> {
  return pollOf(await apiClient.post<any>("/live-overlay/mine/poll", draft, { isAuthRequired: true }));
}

export async function closePoll(): Promise<LivePoll | null> {
  return pollOf(await apiClient.post<any>("/live-overlay/mine/poll/close", {}, { isAuthRequired: true }));
}

/** GET /live/:streamId/recap — what happened on a stream. Only gifts the chain confirmed count. */
export interface RecapPerson {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
}

export interface StreamRecap {
  streamId: string;
  tokenId: number | null;
  title: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number;
  peakViewers: number;
  tips: { total: number; count: number; supporters: number };
  topTippers: Array<RecapPerson & { total: number }>;
  newFollowers: number;
  chat: { messages: number; chatters: number };
  reactions: number;
  /** Null once the server no longer remembers who shared (two days after). */
  shares: number | null;
  polls: Array<{ question: string; options: Array<{ text: string; votes: number }>; total: number }>;
}

const recapNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function getStreamRecap(streamId: string): Promise<StreamRecap> {
  const res: any = await apiClient.get<any>(`/live/${encodeURIComponent(streamId)}/recap`, { isAuthRequired: false });
  const r = res?.result ?? res?.data ?? res;
  return {
    streamId: String(r?.streamId || streamId),
    tokenId: r?.tokenId == null ? null : recapNum(r.tokenId),
    title: String(r?.title || ""),
    startedAt: r?.startedAt || null,
    endedAt: r?.endedAt || null,
    durationSec: recapNum(r?.durationSec),
    peakViewers: recapNum(r?.peakViewers),
    tips: { total: recapNum(r?.tips?.total), count: recapNum(r?.tips?.count), supporters: recapNum(r?.tips?.supporters) },
    topTippers: Array.isArray(r?.topTippers)
      ? r.topTippers.map((t: any) => ({
          address: String(t?.address || ""),
          username: t?.username || undefined,
          displayName: t?.displayName || undefined,
          avatarImageUrl: t?.avatarImageUrl || undefined,
          total: recapNum(t?.total),
        }))
      : [],
    newFollowers: recapNum(r?.newFollowers),
    chat: { messages: recapNum(r?.chat?.messages), chatters: recapNum(r?.chat?.chatters) },
    reactions: recapNum(r?.reactions),
    shares: r?.shares == null ? null : recapNum(r.shares),
    polls: Array.isArray(r?.polls)
      ? r.polls.map((p: any) => ({
          question: String(p?.question || ""),
          options: Array.isArray(p?.options) ? p.options.map((o: any) => ({ text: String(o?.text || ""), votes: recapNum(o?.votes) })) : [],
          total: recapNum(p?.total),
        }))
      : [],
  };
}

/** The creator's most recent finished stream, or null if they have not streamed. */
export async function getLastEndedStreamId(address: string): Promise<string | null> {
  if (!address) return null;
  const res: any = await apiClient.get<any>(`/live/user/${encodeURIComponent(address)}`, { isAuthRequired: true });
  const rows: any[] = Array.isArray(res?.result) ? res.result : Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
  const ended = rows.find((s) => String(s?.status || "").toUpperCase() === "ENDED" && !s?.isTest);
  const id = ended?._id ?? ended?.streamId ?? ended?.id;
  return id ? String(id) : null;
}

/** "1:05:09" or "12:40". */
export function formatStreamDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? `${h}:` : ""}${h ? String(m).padStart(2, "0") : String(m)}:${String(sec).padStart(2, "0")}`;
}

/** Quick controls: only the switches sent change. Every surface drawing the overlay obeys at once. */
export async function setMyControls(change: Partial<OverlayControls>): Promise<CreatorOverlay> {
  return creatorOverlay(await apiClient.put<any>("/live-overlay/mine/controls", { ...change }, { isAuthRequired: true }));
}

/** A creator's subathon: a countdown that paid gifts, follows and subscriptions push back. */
export interface SubathonSettings {
  secondsPerThousand: number;
  secondsPerFollow: number;
  secondsPerSubscribe: number;
  capHours: number;
}

export interface MySubathon extends SubathonSettings {
  running: boolean;
  endsAt: string | null;
}

function mySubathon(res: any): MySubathon {
  const r = res?.result ?? res?.data ?? res ?? {};
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    secondsPerThousand: n(r.secondsPerThousand, 30),
    secondsPerFollow: n(r.secondsPerFollow, 10),
    secondsPerSubscribe: n(r.secondsPerSubscribe, 300),
    capHours: n(r.capHours, 24),
    running: !!r.running && typeof r.endsAt === "string",
    endsAt: typeof r.endsAt === "string" ? r.endsAt : null,
  };
}

export async function getMySubathon(): Promise<MySubathon> {
  return mySubathon(await apiClient.get<any>("/live-overlay/mine/subathon", { isAuthRequired: true }));
}

export async function saveMySubathon(settings: SubathonSettings): Promise<MySubathon> {
  return mySubathon(await apiClient.put<any>("/live-overlay/mine/subathon", { ...settings }, { isAuthRequired: true }));
}

export async function startSubathon(minutes: number, settings: SubathonSettings): Promise<MySubathon> {
  return mySubathon(await apiClient.post<any>("/live-overlay/mine/subathon/start", { ...settings, minutes }, { isAuthRequired: true }));
}

export async function stopSubathon(): Promise<MySubathon> {
  return mySubathon(await apiClient.post<any>("/live-overlay/mine/subathon/stop", {}, { isAuthRequired: true }));
}

/** Time added or taken off by hand, up to an hour either way. */
export async function addSubathonTime(seconds: number): Promise<MySubathon> {
  return mySubathon(await apiClient.post<any>("/live-overlay/mine/subathon/add", { seconds }, { isAuthRequired: true }));
}

export interface PointsRow {
  address: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  points: number;
}

/** A creator's most loyal viewers: a point a minute watched and one per 100 DHB paid. */
export async function getPointsBoard(creator: string, limit = 10): Promise<PointsRow[]> {
  if (!creator) return [];
  const res: any = await apiClient.get<any>(
    `/live-overlay/creator/${encodeURIComponent(creator)}/points?limit=${Math.min(50, Math.max(1, limit))}`,
    { isAuthRequired: false },
  );
  const body = res?.result ?? res?.data ?? res;
  return Array.isArray(body?.top)
    ? body.top.map((r: any) => ({
        address: String(r?.address || ""),
        username: r?.username || undefined,
        displayName: r?.displayName || undefined,
        avatarImageUrl: r?.avatarImageUrl || undefined,
        points: Number(r?.points) || 0,
      }))
    : [];
}
