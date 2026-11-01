import { useLayoutEffect } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { claimFirstScreen } from "../libs/firstScreenReady";

const FEED_FAMILIES = new Set(["home-feed", "home-images", "home-shorts"]);
// A tab with no feed query (the Audio browse page) has nothing to wait on.
const NO_FEED_GRACE_MS = 600;

const isShownFeed = (query: Query) =>
  FEED_FAMILIES.has(String(query.queryKey?.[0])) && query.getObserversCount() > 0;
const hasFirstPage = (query: Query) =>
  query.state.data !== undefined || query.state.status === "error";

/**
 * Home is the first screen of a signed-in launch. It holds the launch reveal
 * until the feed it is showing has its first page (fetched or restored from
 * the persisted cache), so the logo lands on a filled page instead of on
 * skeletons. Only a focused Home claims it; the boot gate caps the wait.
 */
export function useHoldLaunchForFeed(): void {
  const queryClient = useQueryClient();
  const focused = useIsFocused();
  useLayoutEffect(() => {
    if (!focused) return;
    const release = claimFirstScreen();
    const cache = queryClient.getQueryCache();
    const check = () => {
      if (cache.getAll().some(query => isShownFeed(query) && hasFirstPage(query))) release();
    };
    const grace = setTimeout(() => {
      if (!cache.getAll().some(isShownFeed)) release();
    }, NO_FEED_GRACE_MS);
    const unsubscribe = cache.subscribe(check);
    check();
    return () => {
      unsubscribe();
      clearTimeout(grace);
      release();
    };
    // Mount-time only: a launch is claimed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
