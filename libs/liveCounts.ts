/**
 * Live engagement counts
 * ======================
 * Folds fresh counts into feed pages the reader is already looking at, without
 * touching the list itself.
 *
 * The list query is never pulled out from under a reader mid-scroll — that is
 * why the feeds do not refetch on focus. But counts are the part of a card that
 * genuinely goes out of date while it is on screen, and leaving them frozen is
 * what makes a post read 0 likes here and 1 like on its author's profile.
 * Patching count fields alone keeps the numbers honest and the reader's place
 * intact.
 *
 * WHY THIS IS A CACHE PATCH AND NOT AN OVERLAY
 * libs/engagementCache is the viewer's OWN optimistic state, and it retires as
 * soon as the server agrees with it — exactly wrong for authoritative counts
 * coming back from a poll, which have no viewer opinion in them at all. It also
 * layers on top of the item at read time, so a patch here can never fight it:
 * whatever the reader just tapped still wins on screen.
 *
 * The four objections recorded in engagementCache to patching the query cache
 * are objections to writing a WHOLE SNAPSHOT on a tap. None of them applies to
 * this: the rows come from a full /api/feed response so no surface can stamp a
 * zero onto a field it never loaded; only counts are written, never a viewer
 * flag, so nothing account-scoped reaches MMKV; and `updatedAt` is preserved so
 * a patch cannot postpone the next real revalidation.
 *
 * Mirrors dehubweb's src/lib/live-counts.ts.
 */

import type { InfiniteData, QueryClient } from "@tanstack/react-query";

/** A raw /api/feed row, as cached in a feed page's `result`. */
export type RawFeedRow = Record<string, any>;

/**
 * Query-key roots whose pages hold feed rows. Same list the persister trims
 * (config/queryClient.ts) — every infinite feed in the app.
 */
const FEED_ROOTS = ["home-feed", "home-images", "home-shorts", "infinite-feed"];

/**
 * The only fields a background refresh may overwrite on a card already on
 * screen. Order, media and the viewer's own flags are left exactly as the
 * reader found them.
 */
const LIVE_COUNT_FIELDS = [
  "totalViews",
  "views",
  "totalVotes",
  "reactionCounts",
  "likes",
  "dislikes",
  "commentCount",
  "totalTips",
  "totalReposts",
  "reposts",
  "quotes",
] as const;

/** Counts are numbers or small flat objects (`totalVotes`, `reactionCounts`). */
function sameCount(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

/** Mirrors FeedCard's identity resolution, minus the stream fallback. */
function idOf(row: RawFeedRow | undefined): string {
  const raw = row?.tokenId ?? row?.id;
  return raw == null ? "" : String(raw);
}

/**
 * Fold fresh engagement counts into every cached feed page. Rows the caches do
 * not hold are ignored, and an item whose numbers have not moved is handed back
 * by reference so the list's memoised rows do not re-render.
 */
export function mergeLiveCounts(
  queryClient: QueryClient,
  rows: readonly RawFeedRow[],
): void {
  if (!rows?.length) return;

  const fresh = new Map<string, RawFeedRow>();
  for (const row of rows) {
    const id = idOf(row);
    if (id) fresh.set(id, row);
  }
  if (!fresh.size) return;

  for (const root of FEED_ROOTS) {
    for (const query of queryClient.getQueryCache().findAll({ queryKey: [root] })) {
      const data = query.state.data as
        | InfiniteData<{ result?: RawFeedRow[] }>
        | undefined;
      if (!data?.pages?.length) continue;

      let changed = false;
      const pages = data.pages.map((page) => {
        if (!Array.isArray(page?.result)) return page;

        let pageChanged = false;
        const result = page.result.map((item) => {
          const row = fresh.get(idOf(item));
          if (!row) return item;

          const patch: Record<string, unknown> = {};
          for (const field of LIVE_COUNT_FIELDS) {
            if (!(field in row)) continue;
            if (sameCount(item[field], row[field])) continue;
            patch[field] = row[field];
          }
          if (!Object.keys(patch).length) return item;

          pageChanged = true;
          return { ...item, ...patch };
        });

        if (!pageChanged) return page;
        changed = true;
        return { ...page, result };
      });

      if (!changed) continue;

      // Keep the entry's own freshness stamp. This is a count patch, not a
      // refetch: letting it look like one would push the next revalidation out
      // by another staleTime every time the poll landed.
      queryClient.setQueryData(query.queryKey, { ...data, pages }, {
        updatedAt: query.state.dataUpdatedAt,
      });
    }
  }
}

export default mergeLiveCounts;
