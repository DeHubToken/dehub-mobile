/**
 * Feed filter transition
 * ======================
 * Drives the loader that covers the feed pager the instant a filter chip is
 * tapped, instead of leaving the previous results on screen while the new
 * request runs. Mirrors dehubweb's `use-feed-filter-transition`.
 *
 * Why this can't just be the list's `isLoading`: a filter change swaps the
 * query key of every mounted page at once (four feed lists plus the image and
 * shorts grids), and each one reports its own state behind the pager. From the
 * user's side the panel simply sits there until everything lands and the JS
 * thread finishes re-rendering — the "it just freezes" symptom this fixes.
 *
 * Three timings, all doing real work:
 *
 *  - SETTLE_GRACE_MS covers the gap between the tap and the queries actually
 *    starting. The pager defers work off the tap, so nothing is in flight for a
 *    few frames; clearing on that first idle would dismiss the loader before
 *    the fetch even begins.
 *  - MIN_VISIBLE_MS stops a warm cache hit from flashing the loader for one
 *    frame, which reads as a glitch rather than as loading.
 *  - MAX_VISIBLE_MS is the escape hatch. A stalled request must never leave the
 *    feed covered forever — the stale list plus the existing error/retry
 *    handling is a far better failure mode.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** Minimum time on screen, so a cached switch doesn't strobe. */
const MIN_VISIBLE_MS = 420;
/** Window in which a not-yet-started request is still assumed to be coming. */
const SETTLE_GRACE_MS = 280;
/** Hard ceiling. A stalled feed can never trap the pager. */
const MAX_VISIBLE_MS = 8000;

export interface FeedFilterTransition {
  /** True while the loader should cover the feed pager. */
  active: boolean;
  /** Call synchronously from a filter chip handler, before any state update. */
  begin: () => void;
}

/**
 * @param busy Whether any feed query is still in flight — on Home this is
 *   `useIsFetching(...) > 0` across the feed/images/shorts query families.
 */
export function useFeedFilterTransition(busy: boolean): FeedFilterTransition {
  const [active, setActive] = useState(false);
  const startedAt = useRef(0);
  /** Whether `busy` has gone true since begin(); see SETTLE_GRACE_MS above. */
  const sawBusy = useRef(false);

  const begin = useCallback(() => {
    startedAt.current = Date.now();
    sawBusy.current = false;
    setActive(true);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (busy) {
      sawBusy.current = true;
      return;
    }

    const elapsed = Date.now() - startedAt.current;
    const wait = Math.max(
      0,
      MIN_VISIBLE_MS - elapsed,
      // Not busy and never was: the request may still be a frame or two away.
      sawBusy.current ? 0 : SETTLE_GRACE_MS - elapsed,
    );

    const id = setTimeout(() => setActive(false), wait);
    return () => clearTimeout(id);
  }, [active, busy]);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setActive(false), MAX_VISIBLE_MS);
    return () => clearTimeout(id);
  }, [active]);

  return { active, begin };
}

export default useFeedFilterTransition;
