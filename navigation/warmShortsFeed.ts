import { getUnifiedFeed } from '../services/feed.unified.service';
import { getWatchHistory } from '../services/user.service';
import { warmBrainrotFeed, warmedBrainrotPage, warmedWatchedIds } from '../libs/brainrotWarm';

/** Already-watched video ids, which the shorts mix plays last. */
async function loadWatchedVideoIds(): Promise<ReadonlySet<string>> {
  const res = await getWatchHistory({ page: 0, unit: 100, postType: 'video' });
  return new Set((res?.result ?? []).map((item: any) => String(item?.tokenId)));
}

const accountKey = (signedIn: boolean) => (signedIn ? 'in' : 'out');

/**
 * Start loading what comes after a tapped video, so the shorts viewer has its
 * next clips before the first swipe. Cheap to call often: young requests are
 * reused (libs/brainrotWarm).
 */
export function warmShortsFeed(signedIn: boolean): void {
  warmBrainrotFeed({
    account: accountKey(signedIn),
    fetchPage: getUnifiedFeed,
    loadWatchedIds: signedIn ? loadWatchedVideoIds : undefined,
  });
}

/** The brainrot source's fetchers, joining any warm-up already in flight. */
export function shortsFeedFetchers(signedIn: boolean) {
  const account = accountKey(signedIn);
  return {
    fetchPage: warmedBrainrotPage(account, getUnifiedFeed),
    loadWatchedIds: signedIn ? warmedWatchedIds(account, loadWatchedVideoIds) : undefined,
  };
}
