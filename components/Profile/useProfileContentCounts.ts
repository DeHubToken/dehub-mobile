import { useEffect, useMemo, useState } from "react";
import { apiClient } from "../../libs";
import { useProfilePins } from "../../hooks/usePinnedPosts";

export interface ProfileContentCounts {
  home?: number;
  posts?: number;
  images?: number;
  videos?: number;
  songs?: number;
  live?: number;
  subscribers?: number;
  pinned?: number;
  playlists?: number;
  articles?: number;
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

  // The Pinned badge follows the pins list a pin or unpin patches at once,
  // rather than the count read when the profile opened.
  const { data: pins } = useProfilePins(address);
  const pinned = pins?.length;
  return useMemo(() => (pinned === undefined ? counts : { ...counts, pinned }), [counts, pinned]);
}
