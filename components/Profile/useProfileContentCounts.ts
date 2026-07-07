import { useEffect, useState } from "react";
import {
  getUnifiedFeed,
  type FeedPostType,
} from "../../services/feed.unified.service";
import { getPlans } from "../../services/subscription.service";

export interface ProfileContentCounts {
  home?: number;
  posts?: number;
  images?: number;
  videos?: number;
  songs?: number;
  live?: number;
  subscribers?: number;
}

/** Fetch just the totalCount for a given post type (cheap — limit 1). */
async function countFor(minter: string, postType?: FeedPostType): Promise<number> {
  try {
    const res = await getUnifiedFeed({
      minter,
      postType,
      status: "minted",
      sortBy: "createdAt",
      sortOrder: "desc",
      page: 1,
      limit: 1,
    });
    return res.pagination?.totalCount ?? res.result?.length ?? 0;
  } catch {
    return 0;
  }
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
      const [home, posts, images, videos, songs, live, subscribers] = await Promise.all([
        countFor(address), // all content
        countFor(address, "feed-simple"),
        countFor(address, "feed-images"),
        countFor(address, "video"),
        countFor(address, "feed-audio"),
        countFor(address, "live"),
        getPlans(address).then((p) => p?.length ?? 0).catch(() => 0),
      ]);
      if (!cancelled) setCounts({ home, posts, images, videos, songs, live, subscribers });
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return counts;
}
