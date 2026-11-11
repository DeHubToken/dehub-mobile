import { useLayoutEffect } from "react";
import { useIsFocusedLazy } from "./useIsFocusedLazy";
import { useQueryClient, type Query } from "@tanstack/react-query";
import { claimFirstScreen } from "../libs/firstScreenReady";
import { noteLaunch } from "../libs/launchTiming";

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
  const focused = useIsFocusedLazy();
  useLayoutEffect(() => {
    if (!focused) return;
    const release = claimFirstScreen();
    const cache = queryClient.getQueryCache();
    const claimedAt = Date.now();
    let first = true;
    const check = () => {
      const shown = cache.getAll().find(query => isShownFeed(query) && hasFirstPage(query));
      if (shown) {
        // Which feed opened the app, and whether it was the saved copy or a
        // fetch. A saved feed nobody is showing means its key changed.
        const saved = shown.state.dataUpdatedAt === 0 || shown.state.dataUpdatedAt < claimedAt - 2000;
        const unused = cache.getAll().filter(query => FEED_FAMILIES.has(String(query.queryKey?.[0])) && query.getObserversCount() === 0 && query.state.data !== undefined);
        noteLaunch("feed", `${first ? "at once" : `${Date.now() - claimedAt}ms`} ${saved ? "saved" : "fetched"} ${JSON.stringify(shown.queryKey)}${unused.length ? ` unused ${unused.length} ${JSON.stringify(unused[0].queryKey)}` : ""}`);
        release();
      }
      first = false;
    };
    const grace = setTimeout(() => {
      if (!cache.getAll().some(isShownFeed)) {
        noteLaunch("feed", "none shown");
        release();
      }
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
