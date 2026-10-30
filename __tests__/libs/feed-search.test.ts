import { feedSearchParams, feedSearchTabFor } from '../../libs/feed-search';

describe('feed search', () => {
  it('every feed tab but Live searches', () => {
    expect(feedSearchTabFor('all')).toBe('home');
    expect(feedSearchTabFor('feed-images')).toBe('images');
    expect(feedSearchTabFor('video')).toBe('videos');
    expect(feedSearchTabFor('feed-audio')).toBe('music');
    expect(feedSearchTabFor('short')).toBe('shorts');
    expect(feedSearchTabFor('live')).toBeNull();
  });

  it('keeps the feed filters and scopes to the tab', () => {
    const base = { sortBy: 'likes', range: 'week', isPPV: true, category: 'Music', shuffleSeed: 'abc', postType: 'feed-simple' };
    expect(feedSearchParams('images', base, 'sunset')).toEqual({
      sortBy: 'likes', range: 'week', isPPV: true, category: 'Music', postType: 'feed-images', search: 'sunset', status: 'all',
    });
    expect(feedSearchParams('home', base, 'gm').postType).toBe('feed-simple');
    expect(feedSearchParams('music', {}, 'lofi').postType).toBe('feed-audio');
  });
});
