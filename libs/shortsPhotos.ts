import { parseSoundtrack } from './parseSoundtrack';

type PhotoPost = {
  postType?: string; description?: string; imageUrls?: string[]; imageUrl?: string;
  contentRating?: string; is_ppv?: boolean; isLocked?: boolean;
  streamInfo?: { isPayPerView?: boolean; isLockContent?: boolean; lockContentAmount?: number; isAddBounty?: boolean };
  plansDetails?: unknown[];
};

export function shortsPhotoMedia(post: PhotoPost) {
  if (post.postType !== 'feed-images') return undefined;
  const parsed = parseSoundtrack(post.description);
  const sound = { soundtrackUrl: parsed?.url, soundtrackTitle: parsed?.title, soundtrackCreator: parsed?.creator };
  const imageUrls = (post.imageUrls?.length ? post.imageUrls : [post.imageUrl])
    .filter((url): url is string => typeof url === 'string' && !!url.trim())
    .flatMap(path => {
      try {
        const url = new URL(path, 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/');
        return /^https?:$/.test(url.protocol) ? [url.href] : [];
      } catch { return []; }
    });
  if (!sound.soundtrackUrl || !imageUrls.length) return undefined;
  return { ...sound, imageUrls, videoUrl: '', thumbnail: imageUrls[0],
    transcodingStatus: undefined,
    description: (post.description || '').replace(/\[soundtrack:[^\]]*\]/g, '').trim(),
    sound: [sound.soundtrackTitle, sound.soundtrackCreator].filter(Boolean).join(' — ') };
}

/** Shorts has no purchase/reveal gate; only open photo posts enter this viewer. */
export function isShortsPhoto(post: PhotoPost): boolean {
  return !!shortsPhotoMedia(post) && !post.is_ppv && !post.isLocked &&
    !post.streamInfo?.isPayPerView &&
    !(post.streamInfo?.isLockContent && Number(post.streamInfo.lockContentAmount) > 0) &&
    !post.streamInfo?.isAddBounty && !post.plansDetails?.length &&
    (!post.contentRating || post.contentRating === 'safe' || post.contentRating === 'general');
}

export function interleaveShorts<T>(videos: T[], photos: T[]): T[] {
  const result: T[] = [];
  for (let index = 0; index < Math.max(videos.length, photos.length); index++) {
    if (index < videos.length) result.push(videos[index]);
    if (index < photos.length) result.push(photos[index]);
  }
  return result;
}
