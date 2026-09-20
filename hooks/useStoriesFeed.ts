import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  flattenStoriesForViewer,
  getActiveStories,
  groupStoriesByWallet,
  type Story,
  type StoryUserGroup,
} from "../services/stories.service";

export const ACTIVE_STORIES_QUERY_KEY = ["stories", "active"] as const;

// Stories expire on a 24h clock, so a minute of staleness is invisible; what
// it buys is a rail that paints from cache the instant it mounts.
const STORIES_STALE_MS = 60_000;

const EMPTY: Story[] = [];

/**
 * Active stories, shared through the query cache.
 *
 * This was a plain `useState` fetch, and its one consumer — the rail in Home's
 * header — is unmounted on every pager tab but Home. So each return to Home
 * remounted the rail, which paid for a fresh Supabase round trip (two, in
 * fact: the auto-load effect and the refreshKey effect both fired on mount),
 * painted the skeleton row while it waited, then re-laid the header out when
 * the rows arrived. Cached, a remount renders the finished rail in its first
 * frame and revalidates quietly when the data is actually old.
 */
export function useStoriesFeed(autoLoad = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ACTIVE_STORIES_QUERY_KEY,
    queryFn: getActiveStories,
    staleTime: STORIES_STALE_MS,
    enabled: autoLoad,
  });

  const stories = query.data ?? EMPTY;
  // `loading` means "nothing to draw yet": a background revalidation of a rail
  // that is already showing stories must not swap it for the skeleton.
  const loading = autoLoad && query.isPending;
  const error = query.error
    ? query.error instanceof Error
      ? query.error.message
      : "Failed to load stories"
    : null;

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query.refetch]);

  const setStories = useCallback(
    (next: Story[] | ((prev: Story[]) => Story[])) => {
      queryClient.setQueryData<Story[]>(ACTIVE_STORIES_QUERY_KEY, (prev) =>
        typeof next === "function" ? next(prev ?? EMPTY) : next,
      );
    },
    [queryClient],
  );

  const storyUsers = useMemo(() => groupStoriesByWallet(stories), [stories]);
  const flatStories = useMemo(() => flattenStoriesForViewer(stories), [stories]);

  return {
    stories,
    storyUsers,
    flatStories,
    loading,
    error,
    refresh,
    setStories,
  };
}

export type { Story, StoryUserGroup };
