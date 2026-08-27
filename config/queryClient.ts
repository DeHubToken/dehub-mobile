import { AppState } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { storage } from "../libs/storage";

// React Native has no window focus — drive react-query's focus state from
// AppState so stale queries refetch when the app returns to the foreground.
AppState.addEventListener("change", (status) => {
  focusManager.setFocused(status === "active");
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Matches the web app (dehubweb/src/App.tsx:177-180). Was 60s, which —
      // combined with focusManager below — made every foreground after a
      // 60s background trigger a full refetch storm.
      staleTime: 5 * 60_000,
      // Deliberately NOT web's 15min: this must be >= the persister's maxAge,
      // otherwise restored entries are garbage-collected immediately on cold
      // start and the persisted feed never paints.
      gcTime: 24 * 60 * 60 * 1000,
      // Web sets false. The focusManager wiring below still pauses/resumes
      // queries with AppState, but returning to the app no longer refetches
      // everything that happens to be stale.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Infinite feed query roots (see InfiniteVideoFeed / HomeImageGrid /
// ShortsGrid, and Feed/InfiniteFeed for profile and community feeds). Each
// accumulates every scrolled page under the 24h gcTime, so persisting them
// whole means JSON.stringify(<entire cache>) runs on the JS thread on each
// throttle tick while the user scrolls — the periodic scroll-stutter
// signature. We keep only the first page before writing: enough to paint the
// feed instantly on cold start, but a small, fixed-size payload to serialise.
const INFINITE_FEED_KEYS = new Set([
  "home-feed",
  "home-images",
  "home-shorts",
  "infinite-feed",
]);

type InfiniteData = { pages?: unknown[]; pageParams?: unknown[] };

function trimPersistedClient(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((q) => {
        const root = Array.isArray(q.queryKey) ? q.queryKey[0] : q.queryKey;
        const data = q.state?.data as InfiniteData | undefined;
        if (
          typeof root === "string" &&
          INFINITE_FEED_KEYS.has(root) &&
          Array.isArray(data?.pages) &&
          data.pages.length > 1
        ) {
          return {
            ...q,
            state: {
              ...q.state,
              data: {
                ...data,
                pages: data.pages.slice(0, 1),
                pageParams: Array.isArray(data.pageParams)
                  ? data.pageParams.slice(0, 1)
                  : data.pageParams,
              },
            },
          };
        }
        return q;
      }),
    },
  };
}

// MMKV is synchronous, so the restore completes before the first frame.
const baseCachePersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  key: "dehub-query-cache",
  // Was 2_000: at that cadence an actively-scrolled infinite feed re-serialised
  // the whole cache several times a minute on the JS thread. 10s is frequent
  // enough to survive a cold start while keeping the write off the scroll
  // hot-path.
  throttleTime: 10_000,
});

// Persists the query cache to disk so a cold start renders the last known feed
// instantly (then revalidates in the background), like the web app — with the
// infinite feeds trimmed to their first page just before each write.
export const queryCachePersister: typeof baseCachePersister = {
  ...baseCachePersister,
  persistClient: (client) =>
    baseCachePersister.persistClient(trimPersistedClient(client)),
};

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

// Bump to invalidate every persisted cache after a breaking shape change
// (e.g. feed item structure changes between app versions).
export const PERSIST_BUSTER = "v1";

/** When this JS context started. Anything fetched since is this session's own. */
const SESSION_START = Date.now();

/**
 * Stamp restored entries stale. Call once, right after the persister finishes
 * restoring (App.tsx passes it as PersistQueryClientProvider's onSuccess).
 *
 * Restored data is last-known, never current. A hydrated entry keeps its
 * ORIGINAL `dataUpdatedAt`, and staleTime above is five minutes — so a cold
 * start inside that window leaves react-query believing the restored feed is
 * fresh and no refetch is issued at all. The feed then paints the like and view
 * counts from whenever the app was last open, and (refetchOnWindowFocus being
 * false) nothing corrects them. Same fix as dehubweb's query-persist.
 *
 * `dataUpdatedAt: 0` rather than `isInvalidated` alone, because prefetch paths
 * compare timestamps against staleTime and never read the flag.
 */
export function markRestoredCacheStale(): void {
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.status !== "success") continue;
    // Anything this session already fetched is genuinely fresh — leave it be.
    if (query.state.dataUpdatedAt >= SESSION_START) continue;
    query.setState({ ...query.state, dataUpdatedAt: 0, isInvalidated: true });
  }
}
