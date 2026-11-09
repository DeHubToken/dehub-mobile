/**
 * Lives in the Shorts swiper, as on web (dehubweb src/lib/live-shorts.ts):
 * which streams may appear among the shorts, and where their slides go.
 */
import { isStreamLive } from "./live-status";
import { hlsUrlFor, liveThumbnailFor } from "./live-ingest";
import { buildCdnPath, getAvatarUrl } from "./misc";
import { watchingNow } from "./viewers.util";

/** One live slide after this many minus one shorts. */
export const LIVE_SLIDE_EVERY = 6;
/** At most this many streams ride the swiper at once. */
export const LIVE_SLIDE_MAX = 6;

export interface LiveSlide {
  /** Prefixed so it can never collide with a post's token id. */
  id: string;
  __liveSlide: true;
  streamId: string;
  tokenId?: number;
  url: string;
  thumbnail?: string;
  title: string;
  username: string;
  displayName: string;
  avatar?: string;
  /** Watching now, or null when the live list did not say. */
  viewers: number | null;
}

/** Open to anyone and safe, like the shorts around it. Gated streams stay on the Live tab. */
export function isVerticalFeedLive(row: any): boolean {
  if (!row || !isStreamLive(row)) return false;
  const info = row.streamInfo || {};
  if (row.isPayPerView || info.isPayPerView || row.isLocked || info.isLockContent) return false;
  if (Array.isArray(row.plans) && row.plans.length) return false;
  if (Array.isArray(row.subscriberPlans) && row.subscriberPlans.length) return false;
  const rating = row.contentRating || info.contentRating || row.settings?.contentRating;
  if (rating && rating !== "safe") return false;
  return !!hlsUrlFor(row);
}

export function toLiveSlide(row: any): LiveSlide {
  const account = row.account || {};
  const raw: string | undefined = row.thumbnail || row.thumbnailUrl;
  const thumbnail = raw ? (raw.startsWith("http") ? raw : buildCdnPath(raw) ?? undefined) : liveThumbnailFor(row) ?? undefined;
  const avatarPath = account.avatarImageUrl || account.avatarUrl;
  return {
    id: `live-${row._id || row.streamId}`,
    __liveSlide: true,
    streamId: String(row._id || row.streamId),
    tokenId: row.tokenId != null ? Number(row.tokenId) : undefined,
    url: hlsUrlFor(row) || "",
    thumbnail: thumbnail || undefined,
    title: row.title || "",
    username: account.username || "",
    displayName: account.displayName || account.username || "",
    avatar: avatarPath ? getAvatarUrl(avatarPath, 62) : undefined,
    viewers: watchingNow(row),
  };
}

export const isLiveSlide = (item: unknown): item is LiveSlide => !!(item as any)?.__liveSlide;

/**
 * Shorts with a live slide after every `every - 1` shorts, starting after
 * `from` so the slide the viewer opened on (and the one under it) never move.
 */
export function interleaveLive<T>(items: T[], live: LiveSlide[], from: number, every = LIVE_SLIDE_EVERY): Array<T | LiveSlide> {
  if (!live.length) return items;
  const out: Array<T | LiveSlide> = [];
  let next = 0;
  let since = 0;
  items.forEach((item, i) => {
    out.push(item);
    if (i <= from) return;
    since++;
    if (since % (every - 1) === 0 && next < live.length) out.push(live[next++]);
  });
  return out;
}
