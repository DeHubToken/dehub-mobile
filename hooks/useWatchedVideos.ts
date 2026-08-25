/**
 * Videos this account has already played.
 *
 * Feeds show a video you finished last night exactly as they show one you have
 * never opened. This is the set that lets them stop doing that — the same
 * watch history My Library already reads, used as a filter rather than a list.
 *
 * Videos only. A watch record is written on a *unique view*, and what counts as
 * a view differs by card: a video needs real playback, while an image or text
 * post only has to sit on screen. Hiding on the second signal would quietly
 * delete half the feed for scrolling past it, so the history is asked for
 * `postType=video` and nothing else is ever hidden.
 *
 * Fetched only when the preference is on — otherwise this is three requests on
 * every app open for a feature most readers leave off.
 *
 * @module hooks/useWatchedVideos
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getWatchHistory } from "../services/user.service";
import { useAppPrefs } from "./useAppPrefs";
import { useAuthState } from "../context/AuthContext";

/** 3 × 100 = the last 300 videos played. Deeper than a reader scrolls in a sitting. */
const HISTORY_PAGES = 3;
const HISTORY_PAGE_SIZE = 100;

/** How long the set stays good before another open refetches it. */
const STALE_MS = 5 * 60 * 1000;

const EMPTY: ReadonlySet<string> = new Set<string>();

export function useWatchedVideoIds(): { watchedIds: ReadonlySet<string>; hideWatched: boolean } {
  const { hideWatched } = useAppPrefs();
  const { isSignedIn } = useAuthState();
  const [watchedIds, setWatchedIds] = useState<ReadonlySet<string>>(EMPTY);
  const fetchedAt = useRef(0);

  const load = useCallback(async () => {
    const ids = new Set<string>();
    for (let page = 0; page < HISTORY_PAGES; page++) {
      const res = await getWatchHistory({ page, unit: HISTORY_PAGE_SIZE, postType: "video" });
      const items = res?.result ?? [];
      items.forEach((item: any) => {
        if (item?.tokenId !== undefined && item?.tokenId !== null) ids.add(String(item.tokenId));
      });
      if (items.length < HISTORY_PAGE_SIZE) break;
    }
    return ids;
  }, []);

  useEffect(() => {
    if (!hideWatched || !isSignedIn) {
      setWatchedIds(EMPTY);
      return;
    }
    if (Date.now() - fetchedAt.current < STALE_MS) return;

    let cancelled = false;
    fetchedAt.current = Date.now();
    load()
      .then((ids) => {
        if (!cancelled) setWatchedIds(ids);
      })
      .catch(() => {
        // A history that will not load is not a reason to empty the feed —
        // the filter simply does nothing this session.
        if (!cancelled) setWatchedIds(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [hideWatched, isSignedIn, load]);

  return { watchedIds, hideWatched };
}

/**
 * Drop already-played videos from a list. Returns the same array when there is
 * nothing to drop, so callers can keep it in a memo without churn.
 */
export function filterWatched<T extends { tokenId?: number | string; postType?: string }>(
  items: T[],
  watchedIds: ReadonlySet<string>,
  hideWatched: boolean,
): T[] {
  if (!hideWatched || watchedIds.size === 0 || items.length === 0) return items;
  return items.filter((item) => {
    // Only videos and shorts have a watch record worth trusting.
    if (item.postType !== "video" && item.postType !== "short") return true;
    return !watchedIds.has(String(item.tokenId));
  });
}
