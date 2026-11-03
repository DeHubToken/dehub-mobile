jest.mock('../../libs/misc', () => ({ buildFeedImageUrls: (urls: string[]) => urls }));
import { quotedPostViewerParams } from '../../navigation/quotedPostViewerParams';

const video = { tokenId: 42, postType: 'video' };
const photo = { tokenId: 43, postType: 'feed-images', imageUrls: ['https://example.com/photo.jpg'],
  description: '[soundtrack:7:Song:Artist:feed-audio/7.mp3]' };

it.each(['video', 'feed-video', 'short'])('seeds the quoted %s, not the enclosing post', postType => {
  expect(quotedPostViewerParams({ ...video, postType }, 42)).toMatchObject({
    initialItems: [{ tokenId: 42, postType }], feedParams: { brainrot: true, fromId: '42' },
  });
});
it('seeds a soundtrack photo as a photo slide', () => {
  expect(quotedPostViewerParams(photo, 43)).toMatchObject({
    initialItems: [{ postType: 'feed-images', imageUrls: photo.imageUrls }],
    feedParams: { fromId: '43' },
  });
});
it.each([
  { ...photo, description: 'Silent photo' }, { tokenId: 44, postType: 'feed-simple' },
  { ...video, postType: 'live' }, { ...video, postType: 'feed-audio' },
  { ...video, is_ppv: true }, { ...photo, streamInfo: { isLockContent: true, lockContentAmount: 1 } },
  { ...video, plansDetails: [{}] }, { ...video, contentRating: 'mature' },
  { ...photo, spoilerText: 'Reveal first' }, { ...video, visibility: 'followers' },
  { ...video, transcodingStatus: 'pending' }, { ...video, blockedYou: true },
])('keeps ineligible quotes on the resolver: %j', post => {
  expect(quotedPostViewerParams(post, post.tokenId)).toBeNull();
});
