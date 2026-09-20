import { useCallback, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WATCHED_STORIES_KEY = "dehub_watched_stories";

// One set for the process, not one per mount. Each mount used to start with
// an empty set and read AsyncStorage for itself, so every remount of the
// stories rail — one per return to the Home tab — painted every ring bright,
// then re-sorted the row and dimmed the watched ones a beat later when the
// read landed. Loaded once here, a remount renders the settled answer in its
// first frame.
let watchedIds: ReadonlySet<string> = new Set();
let ready = false;
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((fn) => fn());

const load = (): Promise<void> => {
  if (!loadPromise) {
    loadPromise = AsyncStorage.getItem(WATCHED_STORIES_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const stored = new Set(JSON.parse(raw) as string[]);
          // Anything marked while the read was in flight stays marked.
          watchedIds = new Set([...stored, ...watchedIds]);
        } catch {
          // Corrupt entry: start clean rather than fail every mount.
        }
      })
      .catch(() => {})
      .finally(() => {
        ready = true;
        notify();
      });
  }
  return loadPromise;
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  void load();
  return () => {
    listeners.delete(fn);
  };
};

const markWatched = (storyId: string) => {
  if (!storyId || watchedIds.has(storyId)) return;
  const next = new Set(watchedIds);
  next.add(storyId);
  watchedIds = next;
  notify();
  AsyncStorage.setItem(WATCHED_STORIES_KEY, JSON.stringify([...next])).catch(() => {});
};

export function useWatchedStories() {
  const ids = useSyncExternalStore(subscribe, () => watchedIds);
  const isReady = useSyncExternalStore(subscribe, () => ready);

  const isWatched = useCallback((storyId: string) => ids.has(storyId), [ids]);

  return { markWatched, isWatched, ready: isReady };
}
