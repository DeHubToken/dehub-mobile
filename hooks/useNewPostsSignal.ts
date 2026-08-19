/**
 * useNewPostsSignal
 * =================
 * Reports how many posts newer than the ones on screen exist, so the feed can
 * offer a "N new posts" pill instead of leaving the reader on a timeline that
 * quietly went stale.
 *
 * The list query is never pulled out from under the reader — doing that
 * mid-scroll loses their place — which is right for the list and wrong for
 * knowing whether anything happened. So this polls the head of the same feed
 * on its own key, renders nothing from it, and lets the reader decide when the
 * list moves.
 *
 * Comparison is on `createdAt`, not on ids: a post is visible at status
 * `signed` before it mints and the reaper cron recycles its tokenId, so ids
 * aren't stable enough to test identity across two fetches.
 *
 * Mirrors the web hook of the same name in dehubweb's use-unified-feed.
 */

import { useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { getUnifiedFeed, type UnifiedFeedParams } from "../services/feed.unified.service";

/** Rows pulled per poll. Also the ceiling on the count the pill can show. */
const HEAD_SIZE = 20;

/** How often the head is re-checked while the feed is on screen. */
const POLL_MS = 60_000;

interface UseNewPostsSignalOptions {
  /** Poll only when the feed is chronological and this tab is on screen. */
  enabled: boolean;
  /** The same params the list is using, so the head matches the list. */
  params?: Partial<UnifiedFeedParams>;
  /** `createdAt` of the newest post currently rendered. */
  newestCreatedAt?: string;
}

/**
 * React Native has no document visibility, and this app does not wire
 * react-query's focusManager to AppState — so without this the poll would keep
 * hitting the API from a backgrounded app.
 */
function useAppIsActive(): boolean {
  const [isActive, setIsActive] = useState(() => AppState.currentState === "active");

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) =>
      setIsActive(next === "active"),
    );
    return () => sub.remove();
  }, []);

  return isActive;
}

export function useNewPostsSignal({
  enabled,
  params,
  newestCreatedAt,
}: UseNewPostsSignalOptions) {
  const appIsActive = useAppIsActive();
  const polling = enabled && appIsActive && !!newestCreatedAt;

  const { data } = useQuery({
    queryKey: ["home-feed-head", params ?? {}],
    queryFn: () => getUnifiedFeed({ ...(params || {}), page: 1, limit: HEAD_SIZE }),
    enabled: polling,
    refetchInterval: polling ? POLL_MS : false,
    staleTime: POLL_MS / 2,
    gcTime: 5 * 60_000,
    retry: 1,
  });

  return useMemo(() => {
    const newest = newestCreatedAt ? Date.parse(newestCreatedAt) : NaN;
    if (!data || Number.isNaN(newest)) return { newPostCount: 0, atCap: false };

    const newer = (data.result || []).filter((item: any) => {
      const raw = item?.createdAt || item?.created_at || item?.stream?.createdAt;
      const stamp = raw ? Date.parse(raw) : NaN;
      return !Number.isNaN(stamp) && stamp > newest;
    });

    return {
      newPostCount: newer.length,
      // Every row came back newer, so there are likely more than were fetched.
      atCap: newer.length >= HEAD_SIZE,
    };
  }, [data, newestCreatedAt]);
}

export default useNewPostsSignal;
