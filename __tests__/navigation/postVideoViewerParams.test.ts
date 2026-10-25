import { postVideoViewerParams } from '../../navigation/postVideoViewerParams';

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
