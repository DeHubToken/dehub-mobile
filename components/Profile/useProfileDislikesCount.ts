import { useEffect, useState } from "react";
import { apiClient } from "../../libs";
import { useDislikedPostsVersion } from "../../libs/disliked-posts-store";

/** Gives the vote request time to land before the recount after a dislike or undo. */
const RECOUNT_DELAY_MS = 1500;

/**
 * How many posts this account disliked, for the Dislikes tab badge. Same total
 * the tab's list pages through (`/disliked_posts` pagination), and recounted
 * when a post is disliked or undone in this session. 0 when the dislikes are
 * private to someone else (403) or the tab is not shown.
 */
export function useProfileDislikesCount(address: string | undefined, enabled: boolean): number {
  const [count, setCount] = useState(0);
  const version = useDislikedPostsVersion();

  useEffect(() => {
    if (!address || !enabled) {
      setCount(0);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.get<{ result: unknown[]; pagination?: { totalCount?: number } }>(
          `/disliked_posts`,
          { params: { address: address.toLowerCase(), page: 1, limit: 1 } },
        );
        if (!cancelled) setCount(res?.pagination?.totalCount ?? res?.result?.length ?? 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    }, version === 0 ? 0 : RECOUNT_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address, enabled, version]);

  return count;
}
