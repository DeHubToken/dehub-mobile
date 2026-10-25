import { isHoldGated } from '../libs/content-gate';

/** Keep every video entry on the same seeded viewer/continuation contract. */
export function postVideoViewerParams<T>(item: T, tokenId: string | number, initialThumbnail?: string) {
  return {
    initialIndex: 0,
    initialItems: [item],
    initialThumbnail,
    feedParams: { brainrot: true, fromId: String(tokenId) },
  };
}

/** Restricted/unready posts keep the existing detail page's gates and retry UI. */
export function canOpenPostVideoViewer(post: {
  postType?: string; videoDuration?: number; streamKey?: string;
  visibility?: string | null; contentRating?: string; spoilerText?: string | null;
  transcodingStatus?: string; plansDetails?: unknown[] | null;
  isBlocked?: boolean; blockedYou?: boolean;
  streamInfo?: any; stream?: { streamInfo?: any };
}, gated = false): boolean {
  const info = post.streamInfo ?? post.stream?.streamInfo ?? {};
  if (gated || post.postType === 'live' || info.isLive || post.streamKey) return false;
  if (post.postType && post.postType !== 'video' && post.postType !== 'short') return false;
  if (post.isBlocked || post.blockedYou || post.contentRating === 'mature' || post.spoilerText) return false;
  if (post.visibility && post.visibility !== 'public') return false;
  if (post.plansDetails?.length || info.isPayPerView || isHoldGated(info.isLockContent, info.lockAmount ?? info.lockContentAmount)) return false;
  return !['pending', 'on', 'failed'].includes(post.transcodingStatus ?? '');
}
