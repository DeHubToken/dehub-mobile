jest.mock('../../libs', () => ({ apiClient: { get: jest.fn() } }));
import { apiClient } from '../../libs';
import { getShortsFeed } from '../../services/feed.unified.service';

it('merges musical photos and preserves continuation when only their source has another page', async () => {
  const get = apiClient.get as jest.Mock;
  get.mockImplementation(async (url: string) => ({ status: true,
    result: url.startsWith('/feed/shorts') ? [{ tokenId: 1, postType: 'short' }] : [
      { tokenId: 2, postType: 'feed-images', imageUrl: 'two.jpg', description: '[soundtrack:3:Song:Artist]' },
      { tokenId: 4, postType: 'feed-images', imageUrl: 'four.jpg', description: '' },
    ], pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 2, hasMore: !url.startsWith('/feed/shorts') },
    shuffleSeed: 'seed',
  }));
  const result = await getShortsFeed({ followingOnly: true, category: 'music', sortBy: 'random' });
  expect(result.result.map(item => item.tokenId)).toEqual([1, 2]);
  expect(result.pagination.hasMore).toBe(true);
  expect(result.shuffleSeed).toBe('seed');
  expect(get.mock.calls[1][0]).toContain('followingOnly=true');
  expect(get.mock.calls[1][0]).toContain('search=soundtrack');
  expect(get.mock.calls[1][0]).toContain('sortBy=createdAt');
});
