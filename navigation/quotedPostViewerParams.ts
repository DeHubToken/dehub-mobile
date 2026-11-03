import { canOpenPostVideoViewer, postVideoViewerParams } from './postVideoViewerParams';
import { parseSoundtrack } from '../libs/parseSoundtrack';
import { buildFeedImageUrls } from '../libs/misc';

/** Seed the quoted media itself, never the enclosing quote, into the viewer. */
export function quotedPostViewerParams(post: any, tokenId: string | number) {
  const kind = post.postType;
  const video = ['video', 'feed-video', 'short'].includes(kind) ||
    (kind !== 'audio' && kind !== 'feed-audio' && kind !== 'live' &&
      (post.media_type === 'video' || !!post.videoUrl));
  const images = kind === 'feed-images' || kind === 'image'
    ? buildFeedImageUrls(post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : [])
    : [];
  const photo = images.length > 0 && !!parseSoundtrack(post.description)?.url;
  const info = post.streamInfo ?? post.stream?.streamInfo ?? {};
  // Shorts has no purchase or reveal sheet. Keep these posts on the resolver.
  if ((!video && !photo) || post.is_ppv || post.is_locked || post.isLocked ||
      post.is_w2e || info.isAddBounty ||
      !canOpenPostVideoViewer({ ...post, postType: 'video' })) return null;
  const item = photo && !video ? { ...post, tokenId, postType: 'feed-images', imageUrls: images } : { ...post, tokenId };
  return postVideoViewerParams(item, tokenId);
}
