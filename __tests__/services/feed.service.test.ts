import { getFeedNFTs, savePost, getSavedPosts } from '../../services/feed.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

describe('services/feed.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getFeedNFTs', () => {
    it('returns parsed result array', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ name: 'post1' }] });
      const res = await getFeedNFTs({ page: 0, unit: 20 });
      expect(res.result).toHaveLength(1);
    });

    it('handles direct array response', async () => {
      mockGet.mockResolvedValueOnce([{ name: 'post1' }]);
      const res = await getFeedNFTs();
      expect(res.result).toHaveLength(1);
    });

    it('handles data wrapper response', async () => {
      mockGet.mockResolvedValueOnce({ data: [{ name: 'post1' }] });
      const res = await getFeedNFTs();
      expect(res.result).toHaveLength(1);
    });

    it('returns empty result for unexpected shape', async () => {
      mockGet.mockResolvedValueOnce({ something: 'else' });
      const res = await getFeedNFTs();
      expect(res.result).toEqual([]);
    });

    it('uses search params when search is provided', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getFeedNFTs({ search: 'cats', page: 0 });

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('search=cats');
      expect(url).toContain('limit=50'); // search uses limit 50
    });

    it('passes page as 1-indexed', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getFeedNFTs({ page: 0 });

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('page=1');
    });
  });

  describe('savePost', () => {
    it('sends tokenId as number', async () => {
      mockPost.mockResolvedValueOnce({ result: { saved: true } });
      await savePost(42, '0xabc');

      const [endpoint, body] = mockPost.mock.calls[0];
      expect(endpoint).toBe('/savePost');
      expect(body.tokenId).toBe(42);
      expect(body.address).toBe('0xabc');
    });

    it('throws for null tokenId', async () => {
      await expect(savePost(null as any)).rejects.toThrow('tokenId required');
    });

    it('wraps API errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('API down'));
      await expect(savePost(1)).rejects.toThrow('Failed to save post');
    });
  });

  describe('getSavedPosts', () => {
    it('passes pagination params', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getSavedPosts({ page: 2, unit: 10 });

      const url = mockGet.mock.calls[0][0];
      expect(url).toContain('page=2');
      expect(url).toContain('unit=10');
    });

    it('handles various response shapes', async () => {
      mockGet.mockResolvedValueOnce([{ id: 1 }]);
      const res = await getSavedPosts();
      expect(res.result).toHaveLength(1);
    });
  });
});
