import { AppState } from "react-native";
import { QueryClient, focusManager } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { storage } from "../libs/storage";

// React Native has no window focus — drive react-query's focus state from
// AppState so stale queries refetch when the app returns to the foreground.
AppState.addEventListener("change", (status) => {
  focusManager.setFocused(status === "active");
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is served from cache instantly and revalidated in the background
      // once it's older than this — keeps tab switching seamless without
      // hammering the API.
      staleTime: 60_000,
      // Must be >= the persister's maxAge, otherwise restored entries are
      // garbage-collected immediately on cold start.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
    },
  },
});

// Persists the query cache to disk so a cold start renders the last known
// feed instantly (then revalidates in the background), like the web app.
// MMKV is synchronous, so the restore completes before the first frame.
export const queryCachePersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  key: "dehub-query-cache",
  throttleTime: 2_000,
});

export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

// Bump to invalidate every persisted cache after a breaking shape change
// (e.g. feed item structure changes between app versions).
export const PERSIST_BUSTER = "v1";
