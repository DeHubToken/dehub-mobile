import {
  getUnifiedFeed, getShortsFeed,
  isVideoItem, isLiveItem, isImagePostItem,
  isTextPostItem, isAudioPostItem, isFeedPostItem, isShortItem,
} from '../../services/feed.unified.service';
import type { UnifiedFeedItem } from '../../services/feed.unified.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;

const makeFeedItem = (overrides: Partial<UnifiedFeedItem> = {}): UnifiedFeedItem => ({
  tokenId: 1,
  postType: 'video',
  ...overrides,
});

describe('services/feed.unified.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getUnifiedFeed', () => {
    it('returns parsed response with result and pagination', async () => {
      const mockResponse = {
        status: true,
        result: [makeFeedItem({ tokenId: 1 }), makeFeedItem({ tokenId: 2 })],
        pagination: { page: 1, limit: 20, totalCount: 2, totalPages: 1, hasMore: false },
      };
      mockGet.mockResolvedValueOnce(mockResponse);

      const feed = await getUnifiedFeed({ page: 1, limit: 20 });
      expect(feed.result).toHaveLength(2);
      expect(feed.pagination.page).toBe(1);
    });

    it('passes query params correctly', async () => {
      mockGet.mockResolvedValueOnce({ status: true, result: [], pagination: {} });

      await getUnifiedFeed({ page: 2, limit: 10, postType: 'video', sortBy: 'likes' });

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
      expect(url).toContain('postType=video');
      expect(url).toContain('sortBy=likes');
    });

    it('returns empty result for unexpected response shape', async () => {
      mockGet.mockResolvedValueOnce('unexpected');

      const feed = await getUnifiedFeed();
      expect(feed.result).toEqual([]);
      expect(feed.status).toBe(false);
    });

    it('propagates API errors', async () => {
      mockGet.mockRejectedValueOnce(new Error('Network failure'));
      await expect(getUnifiedFeed()).rejects.toThrow('Network failure');
    });

    it('builds default pagination when missing', async () => {
      mockGet.mockResolvedValueOnce({
        status: true,
        result: [makeFeedItem()],
      });

      const feed = await getUnifiedFeed();
      expect(feed.pagination).toBeDefined();
      expect(feed.pagination.hasMore).toBe(false);
    });
  });

  describe('getShortsFeed', () => {
    it('calls /feed/shorts endpoint', async () => {
      mockGet.mockResolvedValueOnce({
        status: true,
        result: [makeFeedItem({ postType: 'short' })],
        pagination: { page: 1, limit: 20, totalCount: 1, totalPages: 1, hasMore: false },
        shuffleSeed: 'seed-123',
      });

      const res = await getShortsFeed({ page: 1, shuffleSeed: 'seed-123' });
      expect(res.result).toHaveLength(1);
      expect(res.shuffleSeed).toBe('seed-123');

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('/feed/shorts');
      expect(url).toContain('shuffleSeed=seed-123');
    });

    it('returns empty for non-object response', async () => {
      mockGet.mockResolvedValueOnce(null);
      const res = await getShortsFeed();
      expect(res.result).toEqual([]);
    });
  });

  describe('type guard functions', () => {
    it('isVideoItem returns true for video or undefined postType', () => {
      expect(isVideoItem(makeFeedItem({ postType: 'video' }))).toBe(true);
      expect(isVideoItem(makeFeedItem({ postType: undefined as any }))).toBe(true);
      expect(isVideoItem(makeFeedItem({ postType: 'short' }))).toBe(false);
    });

    it('isLiveItem identifies live posts', () => {
      expect(isLiveItem(makeFeedItem({ postType: 'live' }))).toBe(true);
      expect(isLiveItem(makeFeedItem({ postType: 'video' }))).toBe(false);
    });

    it('isImagePostItem identifies image posts', () => {
      expect(isImagePostItem(makeFeedItem({ postType: 'feed-images' }))).toBe(true);
    });

    it('isTextPostItem identifies text posts', () => {
      expect(isTextPostItem(makeFeedItem({ postType: 'feed-simple' }))).toBe(true);
    });

    it('isAudioPostItem identifies audio posts', () => {
      expect(isAudioPostItem(makeFeedItem({ postType: 'feed-audio' }))).toBe(true);
    });

    it('isFeedPostItem identifies any feed post', () => {
      expect(isFeedPostItem(makeFeedItem({ postType: 'feed-images' }))).toBe(true);
      expect(isFeedPostItem(makeFeedItem({ postType: 'feed-simple' }))).toBe(true);
      expect(isFeedPostItem(makeFeedItem({ postType: 'feed-audio' }))).toBe(true);
      expect(isFeedPostItem(makeFeedItem({ postType: 'video' }))).toBe(false);
    });

    it('isShortItem identifies shorts', () => {
      expect(isShortItem(makeFeedItem({ postType: 'short' }))).toBe(true);
      expect(isShortItem(makeFeedItem({ postType: 'video' }))).toBe(false);
    });
  });
});
