import { hasPostDetailSeed, seedPostDetail } from '../../libs/navPrefetch';

it('recognizes a loaded post across supported route shapes, including token zero', () => {
  seedPostDetail(0, { tokenId: 0, name: 'Loaded text' });
  expect(hasPostDetailSeed({ postId: 0 })).toBe(true);
  expect(hasPostDetailSeed({ nft: { tokenId: 0 } })).toBe(true);
  expect(hasPostDetailSeed({ videoId: 0 })).toBe(true);
});

it('uses the detail screen ID precedence and keeps unknown deep links on the fallback', () => {
  seedPostDetail('known', { tokenId: 'known' });
  expect(hasPostDetailSeed({ tokenId: 'missing', postId: 'known' })).toBe(false);
  expect(hasPostDetailSeed({ postId: 'missing' })).toBe(false);
  expect(hasPostDetailSeed(undefined)).toBe(false);
});
