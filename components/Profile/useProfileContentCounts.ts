import { useEffect, useState } from "react";
import { apiClient } from "../../libs";

export interface ProfileContentCounts {
  home?: number;
  posts?: number;
  images?: number;
  videos?: number;
  songs?: number;
  live?: number;
  subscribers?: number;
  pinned?: number;
}

/**
 * Loads per-tab content counts for a profile so the tab bar can show
 * count badges like the web profile page.
 */
export function useProfileContentCounts(address?: string): ProfileContentCounts {
  const [counts, setCounts] = useState<ProfileContentCounts>({});

  useEffect(() => {
    if (!address) {
      setCounts({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await apiClient.get<{ result: ProfileContentCounts }>(
          `/profile_counts/${encodeURIComponent(address)}`,
        );
        if (!cancelled) setCounts(response?.result || {});
      } catch {
        if (!cancelled) setCounts({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return counts;
}
