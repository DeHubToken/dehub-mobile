import { useCallback, useSyncExternalStore } from "react";
import {
  resolveMyReaction,
  resolveReactionCounts,
  resolveLikeCount,
  resolveDislikeCount,
  type PostReaction,
  type ReactionCounts,
} from "./reactions";

/**
 * Cross-component overlay for optimistic engagement (like / dislike / save /
 * repost).
 *
 * THE BUG THIS FIXES
 * FeedCard keeps engagement in local useState seeded from `item.*`, and nothing
 * ever syncs it back. So a like was lost whenever the row was recycled out of
 * the window or the user navigated away and back, and HomeScreen mounts six
 * feed lists over the same posts, so liking in "All" left "Video" showing the
 * old count.
 *
 * WHY THIS IS AN OVERLAY AND NOT A QUERY-CACHE PATCH
 * The web app also rewrites the react-query cache (patchFeedCaches). Porting
 * that here was evaluated and rejected — on this codebase it introduces four
 * regressions the web version does not have:
 *   1. `setQueryData` without `updatedAt` resets dataUpdatedAt, so every tap
 *      makes the feed query fresh for another staleTime. With
 *      refetchOnWindowFocus:false (config/queryClient.ts) an active user could
 *      postpone revalidation indefinitely.
 *   2. Not every surface carries every field. screens/SearchScreen.tsx's
 *      toFeedItem maps isLiked/isSaved but NOT reposts/quotes/isReposted, so a
 *      whole-snapshot write from a search result would stamp `reposts: 0` onto
 *      the home-feed copy of that post.
 *   3. Patched page-0 items get persisted to MMKV, so a wrong value outlives
 *      the process.
 *   4. It leaks across accounts, because nothing clears the feed query caches
 *      on sign-out.
 * The overlay alone fixes both symptoms above, and a patch that is only held in
 * memory can never poison the persisted cache.
 *
 * PATCHES ARE FIELD-SCOPED
 * Only the fields a handler actually touched are stored. Liking from a surface
 * that never loaded repost data therefore cannot clobber repost counts
 * elsewhere — the untouched fields keep coming from the item.
 */

export interface EngagementFields {
  isLiked: boolean;
  isDisliked: boolean;
  isSaved: boolean;
  isReposted: boolean;
  likeCount: number;
  dislikeCount: number;
  /** reposts + quotes, matching how FeedCard displays it. */
  repostCount: number;
  /**
   * Which of the nine reactions the viewer holds, or null for none.
   * `isLiked`/`isDisliked` remain its POLARITY, so a post the viewer loved
   * still reads as liked to anything that only knows about likes.
   */
  myReaction: PostReaction | null;
  /** Per-reaction totals — the most-used one leads on the card. */
  reactionCounts: ReactionCounts;
}

export type EngagementPatch = Partial<EngagementFields>;

interface Entry {
  patch: Readonly<EngagementPatch>;
  timestamp: number;
}

/**
 * Must outlast the query staleTime (5 min, config/queryClient.ts) so the
 * overlay is still in force if a refetch has not happened yet. It is
 * deliberately finite: expiry is what eventually lets corrected server values
 * win back if a write silently failed.
 */
export const ENGAGEMENT_TTL_MS = 15 * 60_000;
const MAX_ENTRIES = 500;

const store = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/**
 * Mirrors FeedCard's own identity resolution (`item.tokenId ?? item.id ??
 * stream?.tokenId`). String-coerced because UnifiedFeedItem.tokenId is
 * `number | string` while GetNFTsResult.tokenId is string-only.
 */
export function engagementKeyOf(item: any): string {
  const raw = item?.tokenId ?? item?.id ?? item?.stream?.tokenId;
  return raw == null ? "" : String(raw);
}

/**
 * Pure Map lookup — no Date.now() here. This is a useSyncExternalStore
 * getSnapshot, so it must return a referentially stable value; the TTL is
 * applied when the entry is read instead.
 */
function getEntry(key: string): Entry | undefined {
  return store.get(key);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function prune() {
  const now = Date.now();
  for (const [k, e] of store) {
    if (now - e.timestamp > ENGAGEMENT_TTL_MS) store.delete(k);
  }
  // Hard cap. Map iterates in insertion order and setEngagement re-inserts on
  // write, so the oldest-touched keys go first.
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let i = 0;
    for (const k of store.keys()) {
      if (i++ >= excess) break;
      store.delete(k);
    }
  }
}

/** Merge a field-scoped patch for `key` and notify every mounted consumer. */
export function applyEngagement(key: string, patch: EngagementPatch): void {
  if (!key) return;
  const existing = store.get(key);
  const merged = { ...(existing?.patch ?? {}), ...patch };
  // Delete before set so insertion order tracks recency for the cap above.
  store.delete(key);
  store.set(key, { patch: Object.freeze(merged), timestamp: Date.now() });
  prune();
  emit();
}

/**
 * Roll back only the fields a failed request owned, leaving any other field
 * (possibly set by a different, successful action) untouched.
 */
export function revertEngagement(key: string, patch: EngagementPatch): void {
  applyEngagement(key, patch);
}

/** Call on sign-out / wallet change so one account's state cannot leak into another's. */
export function clearAllEngagement(): void {
  store.clear();
  emit();
}

function fromItem(item: any): EngagementFields {
  return {
    isLiked: !!item?.isLiked,
    isDisliked: !!item?.isDisliked,
    isSaved: !!item?.isSaved,
    isReposted: !!item?.isReposted,
    likeCount: resolveLikeCount(item),
    dislikeCount: resolveDislikeCount(item),
    repostCount: (item?.reposts || 0) + (item?.quotes || 0),
    myReaction: resolveMyReaction(item),
    reactionCounts: resolveReactionCounts(item),
  };
}

/**
 * Viewer-scoped fields the API includes only when it recognises the caller.
 * api.dehub.io answers an EXPIRED token with 200-and-none-of-these rather than
 * a 401, so their joint absence means "anonymous response", not "the viewer
 * has no engagement".
 */
const VIEWER_FIELDS = ["isLiked", "isDisliked", "isSaved", "isReposted", "myReaction", "isUnlocked", "isOwner"] as const;

export function itemHasViewerFields(item: any): boolean {
  return !!item && VIEWER_FIELDS.some((f) => item[f] !== undefined);
}

function resolve(item: any, entry: Entry | undefined): EngagementFields {
  const base = fromItem(item);
  if (!entry) return base;
  if (Date.now() - entry.timestamp > ENGAGEMENT_TTL_MS) return base;

  const p = entry.patch;

  // An anonymous response (expired token → 200 with every viewer field
  // stripped) expresses no opinion about this viewer; judging the overlay
  // against it would retire held reactions to neutral. Keep the patch until a
  // response that actually carries viewer fields agrees.
  if (!itemHasViewerFields(item)) return { ...base, ...p };
  // Retire the overlay once the server agrees on every flag we hold. Without
  // this the overlay would keep winning for the full TTL even after a
  // pull-to-refresh delivered authoritative counts, so a refreshed post would
  // visibly stop tracking other users' votes.
  //
  // myReaction has to be part of this check, not just the polarity flags:
  // swapping like → love leaves isLiked true on BOTH sides, so without it the
  // overlay would read as "confirmed" the instant it was written and the card
  // would snap straight back to 👍.
  const confirmed =
    (p.isLiked === undefined || p.isLiked === base.isLiked) &&
    (p.isDisliked === undefined || p.isDisliked === base.isDisliked) &&
    (p.myReaction === undefined || p.myReaction === base.myReaction) &&
    (p.isSaved === undefined || p.isSaved === base.isSaved) &&
    (p.isReposted === undefined || p.isReposted === base.isReposted);
  if (confirmed) return base;

  return { ...base, ...p };
}

/**
 * Read the effective engagement for `item`, re-rendering whenever another
 * component writes to the same post. This is what keeps the six mounted home
 * feed lists in agreement without a refetch.
 */
export function useEngagement(item: any): EngagementFields {
  const key = engagementKeyOf(item);
  const getSnapshot = useCallback(() => getEntry(key), [key]);
  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return resolve(item, entry);
}

/** Non-reactive read, for seeding useState initializers on mount. */
export function peekEngagement(item: any): EngagementFields {
  return resolve(item, getEntry(engagementKeyOf(item)));
}

/**
 * True when a resolved API response actually represents a failure.
 * libs/api.client.ts only throws on `!response.ok`; a 200 carrying
 * `{ error: "..." }` resolves normally (see services/nft.service.ts:225, whose
 * return type is `Promise<{ error?: string } | undefined>`). Relying on
 * `.catch()` alone would let a soft failure be recorded as success.
 */
export function isFailedResponse(res: any): boolean {
  return !!res?.error;
}
