import { useCallback, useEffect, useMemo, useState } from "react";
import {
  flattenStoriesForViewer,
  getActiveStories,
  groupStoriesByWallet,
  type Story,
  type StoryUserGroup,
} from "../services/stories.service";

export function useStoriesFeed(autoLoad = true) {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveStories();
      setStories(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load stories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) refresh();
  }, [autoLoad, refresh]);

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
