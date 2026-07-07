import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WATCHED_STORIES_KEY = "dehub_watched_stories";

export function useWatchedStories() {
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(WATCHED_STORIES_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          setWatchedIds(new Set(JSON.parse(raw) as string[]));
        } catch {
          setWatchedIds(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const markWatched = useCallback((storyId: string) => {
    if (!storyId) return;
    setWatchedIds((prev) => {
      if (prev.has(storyId)) return prev;
      const next = new Set(prev);
      next.add(storyId);
      AsyncStorage.setItem(WATCHED_STORIES_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (storyId: string) => watchedIds.has(storyId),
    [watchedIds],
  );

  return { markWatched, isWatched, ready };
}
