import { isShortsPhoto, shortsPhotoMedia, interleaveShorts } from '../../libs/shortsPhotos';
const post = { postType: 'feed-images', imageUrls: ['one.jpg', 'two.jpg'], description: 'Caption [soundtrack:5373:Song:Artist]' };
it('keeps the whole slideshow with one soundtrack and no guessed video', () => {
  expect(shortsPhotoMedia(post)).toMatchObject({ videoUrl: '', description: 'Caption',
    soundtrackUrl: 'https://dehubcdn.ams3.cdn.digitaloceanspaces.com/feed-audio/5373-audio.mp3' });
  expect(shortsPhotoMedia(post)?.imageUrls).toHaveLength(2);
  expect(shortsPhotoMedia({ ...post, imageUrls: ['nfts/images/5421-1.jpg'] })?.imageUrls[0]).toContain('/feed-images/5421-1.jpg');
  expect(isShortsPhoto(post)).toBe(true);
});
it('excludes gated, mature, silent or invalid photos', () => {
  for (const change of [{ description: '' }, { contentRating: 'mature' }, { imageUrls: ['javascript:bad'] },
    { plansDetails: [{}] }, { streamInfo: { isPayPerView: true } },
    { streamInfo: { isLockContent: true, lockContentAmount: 1 } }, { streamInfo: { isAddBounty: true } }]) {
    expect(isShortsPhoto({ ...post, ...change })).toBe(false);
  }
});
it('interleaves without losing the longer source', () => {
  expect(interleaveShorts(['v1'], ['p1', 'p2'])).toEqual(['v1', 'p1', 'p2']);
});
