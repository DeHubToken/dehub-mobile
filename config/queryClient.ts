import { AppState } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { storage } from "../libs/storage";

// React Native has no window focus — drive react-query's focus state from
// AppState so stale queries refetch when the app returns to the foreground.
//
// Only a real background counts. react-query pauses any request that is
// between retries while focus is off (retryer: `focusManager.isFocused() &&
// ...`), and a paused request is not a failed one — it makes no call, throws
// nothing, and leaves the query pending, so the screen sits on its skeleton
// with no error and no way back until focus returns. `inactive` is the state
// Android reports for a notification shade, a permission dialog or the recents
// preview; the app is still on screen and its requests must keep running. See
// useAppLifecycle: those transitions fire constantly.
AppState.addEventListener("change", (status) => {
  if (status === "inactive") return;
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
//
// Any query whose data carries a `pages` array is an infinite query and gets
// the same treatment. A fixed key list used to miss the music feed and the
// feature-requests board, which were persisted whole on every throttle tick.
type InfiniteData = { pages?: unknown[]; pageParams?: unknown[] };

function trimPersistedClient(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((q) => {
        const data = q.state?.data as InfiniteData | undefined;
        if (
          data &&
          typeof data === "object" &&
          Array.isArray(data.pages) &&
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

let saveFailureReported = false;

/**
 * One value JSON cannot write (a BigInt from a chain read, a circular object)
 * used to throw away the whole save, silently, every time: nothing was ever on
 * disk, and every cold start waited on the network for its first feed. Entries
 * that cannot be written are now left out and the rest is saved.
 */
export function serializePersistedClient(client: PersistedClient): string {
  try {
    return JSON.stringify(client);
  } catch (error) {
    const dropped: string[] = [];
    const queries = client.clientState.queries.filter((query) => {
      try {
        JSON.stringify(query);
        return true;
      } catch {
        dropped.push(String(query.queryKey?.[0]));
        return false;
      }
    });
    if (!saveFailureReported) {
      saveFailureReported = true;
      const names = Array.from(new Set(dropped)).slice(0, 12).join(", ");
      // eslint-disable-next-line no-console
      console.warn(`[cache] save skipped ${dropped.length} entries: ${names || "mutations"} (${String((error as Error)?.message).slice(0, 120)})`);
      try {
        require("../libs/errorReporter").reportError("QueryCache", ["Saved cache left entries out"], {
          level: "warn",
          metadata: { dropped: names, count: dropped.length, message: String((error as Error)?.message).slice(0, 200) },
        });
      } catch {
        /* reporting is best effort */
      }
    }
    return JSON.stringify({ ...client, clientState: { ...client.clientState, mutations: [], queries } });
  }
}

let saves = 0;
let writeFailureReported = false;

function noteCache(key: string, value: string): void {
  try {
    require("../libs/launchTiming").noteLaunch(key, value);
  } catch {
    /* a launch note only */
  }
}

function reportSaveFailure(message: string): void {
  if (writeFailureReported) return;
  writeFailureReported = true;
  // eslint-disable-next-line no-console
  console.warn(`[cache] ${message}`);
  try {
    require("../libs/errorReporter").reportError("QueryCache", ["Saved cache was not written"], {
      level: "warn",
      metadata: { message },
    });
  } catch {
    /* reporting is best effort */
  }
}

// MMKV is synchronous, so the restore completes before the first frame.
const baseCachePersister = createSyncStoragePersister({
  serialize: serializePersistedClient,
  storage: {
    getItem: (key) => {
      const saved = storage.getString(key) ?? null;
      noteCache("disk", saved ? `${Math.round(saved.length / 1024)}kB` : "empty");
      return saved;
    },
    setItem: (key, value) => {
      try {
        storage.set(key, value);
        saves += 1;
        // The first two writes of a session are enough to see that saving works.
        // eslint-disable-next-line no-console
        if (saves <= 2) console.log(`[cache] saved ${Math.round(value.length / 1024)}kB`);
      } catch (error) {
        reportSaveFailure(`write failed (${Math.round(value.length / 1024)}kB): ${String((error as Error)?.message).slice(0, 160)}`);
        throw error;
      }
    },
    removeItem: (key) => {
      noteCache("diskDropped", "expired or changed");
      storage.delete(key);
    },
  },
  key: "dehub-query-cache",
  // Was 2_000: at that cadence an actively-scrolled infinite feed re-serialised
  // the whole cache several times a minute on the JS thread. 10s is frequent
  // enough to survive a cold start while keeping the write off the scroll
  // hot-path.
  // 30s: at 10s the live-count poll (same period) dirtied the cache on every
  // tick, so the serialisation ran as often as the poll did.
  throttleTime: 30_000,
});

// Persists the query cache to disk so a cold start renders the last known feed
// instantly (then revalidates in the background), like the web app — with the
// infinite feeds trimmed to their first page just before each write.
export const queryCachePersister: typeof baseCachePersister = {
  ...baseCachePersister,
  persistClient: (client) => {
    try {
      return baseCachePersister.persistClient(trimPersistedClient(client));
    } catch (error) {
      reportSaveFailure(`save threw: ${String((error as Error)?.message).slice(0, 160)}`);
    }
  },
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
  try {
    const restored = queryClient.getQueryCache().getAll().filter((query) => query.state.data !== undefined && query.state.dataUpdatedAt < SESSION_START);
    require("../libs/launchTiming").noteLaunch("restored", `${restored.length} entries`);
  } catch {
    /* a launch note only */
  }
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.status !== "success") continue;
    // Anything this session already fetched is genuinely fresh — leave it be.
    if (query.state.dataUpdatedAt >= SESSION_START) continue;
    query.setState({ ...query.state, dataUpdatedAt: 0, isInvalidated: true });
  }
}
