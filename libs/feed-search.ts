/**
 * Feed search: tapping the lit tab in the feed pill turns the pill into a
 * search for that feed (Home, Images, Videos, Music). Same behaviour as web's
 * lib/feed-search. Results use the feed's own filters, so the params are the
 * tab's feed params plus the words.
 */
import type { UnifiedFeedParams } from '../services/feed.unified.service';

export type FeedSearchTab = 'home' | 'images' | 'videos' | 'music';

/** Pager tab key -> search tab. Shorts and Live keep their old re-tap. */
const TAB_BY_KEY: Record<string, FeedSearchTab> = {
  all: 'home',
  'feed-images': 'images',
  video: 'videos',
  'feed-audio': 'music',
};

export const FEED_SEARCH_KEYS = ['all', 'feed-images', 'video', 'feed-audio'] as const;

export function feedSearchTabFor(key: string | undefined | null): FeedSearchTab | null {
  return (key && TAB_BY_KEY[key]) || null;
}

const POST_TYPE: Record<Exclude<FeedSearchTab, 'home'>, UnifiedFeedParams['postType']> = {
  images: 'feed-images',
  videos: 'video',
  music: 'feed-audio',
};

/**
 * /api/feed params for a search in `tab`. `base` is the params the feed itself
 * is using (sort, date, content access, category; Home's post type), so the
 * results follow the same filters. Random's shuffle seed is dropped: search
 * results should not reshuffle under the finger.
 */
export function feedSearchParams(
  tab: FeedSearchTab,
  base: Record<string, unknown>,
  query: string,
): UnifiedFeedParams {
  const { shuffleSeed: _seed, page: _page, limit: _limit, ...rest } = base as UnifiedFeedParams & Record<string, unknown>;
  return {
    ...(rest as UnifiedFeedParams),
    postType: tab === 'home' ? (rest.postType as UnifiedFeedParams['postType']) : POST_TYPE[tab],
    search: query,
    status: 'all',
  };
}
