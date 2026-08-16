import { useEffect, useState } from "react";
import {
  getUnifiedFeed,
  type FeedPostType,
} from "../../services/feed.unified.service";
import { getPlans } from "../../services/subscription.service";
import { getUserReplies } from "../../services/user.service";
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

/** Fetch just the totalCount for a given post type (cheap — limit 1). */
async function countFor(minter: string, postType?: FeedPostType): Promise<number> {
  try {
    const res = await getUnifiedFeed({
      minter,
      postType,
      status: "all",
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

async function countComments(address: string): Promise<number> {
  try {
    const response = await getUserReplies({ address, page: 1, limit: 1 });
    return response.result.pagination?.totalCount ?? response.result.items.length;
  } catch {
    return 0;
  }
}

async function countPins(address: string): Promise<number> {
  try {
    const response = await apiClient.get<{
      result?: unknown[];
      pagination?: { totalCount?: number; total?: number };
    }>("/pins", { params: { address, page: 1, limit: 1 } });
    return (
      response?.pagination?.totalCount ??
      response?.pagination?.total ??
      response?.result?.length ??
      0
    );
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
      const [home, textPosts, comments, images, videos, songs, live, subscribers, pinned] = await Promise.all([
        countFor(address), // all content
        countFor(address, "feed-simple"),
        countComments(address),
        countFor(address, "feed-images"),
        countFor(address, "video"),
        countFor(address, "feed-audio"),
        countFor(address, "live"),
        getPlans(address).then((p) => p?.length ?? 0).catch(() => 0),
        countPins(address),
      ]);
      if (!cancelled) {
        setCounts({
          home,
          posts: textPosts + comments,
          images,
          videos,
          songs,
          live,
          subscribers,
          pinned,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  return counts;
}
