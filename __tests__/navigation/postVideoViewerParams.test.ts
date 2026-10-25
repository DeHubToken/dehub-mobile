import { canOpenPostVideoViewer, postVideoViewerParams } from '../../navigation/postVideoViewerParams';

it.each([
  { postType: 'video' }, { postType: 'short' }, {},
])('opens an ordinary ready video directly: %j', post => {
  expect(canOpenPostVideoViewer(post)).toBe(true);
});

it.each([
  { postType: 'live' }, { streamInfo: { isLive: true } }, { streamKey: 'live' },
  { postType: 'feed-audio' }, { postType: 'feed-images' }, { postType: 'feed-simple' },
  { streamInfo: { isPayPerView: true } },
  { streamInfo: { isLockContent: true, lockContentAmount: 1 } },
  { stream: { streamInfo: { isPayPerView: true } } },
  { plansDetails: [{}] }, { visibility: 'followers' }, { visibility: 'direct' },
  { contentRating: 'mature' }, { spoilerText: 'Reveal first' },
  { isBlocked: true }, { blockedYou: true },
  { transcodingStatus: 'pending' }, { transcodingStatus: 'on' }, { transcodingStatus: 'failed' },
])('retains the existing gate/detail path: %j', post => {
  expect(canOpenPostVideoViewer(post)).toBe(false);
});

it('respects the live card gate result even when the cached post looks public', () => {
  expect(canOpenPostVideoViewer({ postType: 'video' }, true)).toBe(false);
});

it('hands the already-loaded post and poster to the viewer with video continuation', () => {
  const item = { tokenId: 42, postType: 'video', hlsUrl: 'https://media.example/42.m3u8' };
  const params = postVideoViewerParams(item, item.tokenId, 'https://media.example/42.jpg');
  expect(params.initialItems[0]).toBe(item);
  expect(params.initialIndex).toBe(0);
  expect(params.initialThumbnail).toBe('https://media.example/42.jpg');
  expect(params.feedParams).toEqual({ brainrot: true, fromId: '42' });
});

it('accepts a zero token ID and a post without a poster', () => {
  const item = { tokenId: 0 };
  const params = postVideoViewerParams(item, 0);
  expect(params.initialItems[0]).toBe(item);
  expect(params.feedParams.fromId).toBe('0');
  expect(params.initialThumbnail).toBeUndefined();
});
