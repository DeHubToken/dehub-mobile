import {
  toggleRepost,
  getUserReposts,
  getRepostUsers,
  createQuotePost,
  getQuotePosts,
} from '../../services/repost.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;

describe('services/repost.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('toggleRepost', () => {
    it('sends POST /repost with tokenId', async () => {
      mockPost.mockResolvedValueOnce({
        status: true,
        reposted: true,
        repostCount: 5,
        message: 'Reposted',
      });

      const res = await toggleRepost(42);
      expect(mockPost).toHaveBeenCalledWith(
        '/repost',
        { tokenId: 42 },
        { isAuthRequired: true },
      );
      expect(res.reposted).toBe(true);
      expect(res.repostCount).toBe(5);
    });

    it('unwraps data wrapper', async () => {
      mockPost.mockResolvedValueOnce({
        data: { status: true, reposted: false, repostCount: 0, message: 'Unreposted' },
      });

      const res = await toggleRepost(1);
      expect(res.reposted).toBe(false);
    });

    it('re-throws on API error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Server error'));
      await expect(toggleRepost(1)).rejects.toThrow('Server error');
    });
  });

  describe('getUserReposts', () => {
    it('passes pagination query params', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ id: 1 }], pagination: { page: 1 } });

      const res = await getUserReposts({ address: '0xabc', page: 2, limit: 10 });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('address=0xabc');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
      expect(res.result).toHaveLength(1);
    });

    it('defaults page=1, limit=20', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });

      await getUserReposts({ address: '0xabc' });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('limit=20');
    });

    it('returns empty array for non-array result', async () => {
      mockGet.mockResolvedValueOnce({ result: 'not-an-array' });
      const res = await getUserReposts({ address: '0x1' });
      expect(res.result).toEqual([]);
    });

    it('unwraps data wrapper', async () => {
      mockGet.mockResolvedValueOnce({ data: { result: [{ id: 1 }] } });
      const res = await getUserReposts({ address: '0x1' });
      expect(res.result).toHaveLength(1);
    });
  });

  describe('getRepostUsers', () => {
    it('normalises user data from nested shape', async () => {
      mockGet.mockResolvedValueOnce({
        result: [
          {
            address: '0xraw',
            repostedAt: '2024-01-01',
            user: {
              address: '0xuser',
              username: 'alice',
              displayName: 'Alice',
              avatarImageUrl: 'avatar.png',
              followers: 100,
            },
          },
        ],
      });

      const res = await getRepostUsers({ tokenId: 42 });
      expect(res.result[0]).toEqual({
        address: '0xuser',
        username: 'alice',
        displayName: 'Alice',
        avatarImageUrl: 'avatar.png',
        followers: 100,
        repostedAt: '2024-01-01',
      });
    });

    it('falls back to raw address when user is missing', async () => {
      mockGet.mockResolvedValueOnce({
        result: [{ address: '0xraw' }],
      });

      const res = await getRepostUsers({ tokenId: 1 });
      expect(res.result[0].address).toBe('0xraw');
    });

    it('uses avatarUrl fallback when avatarImageUrl is missing', async () => {
      mockGet.mockResolvedValueOnce({
        result: [
          {
            address: '0x1',
            user: { avatarUrl: 'fallback.png' },
          },
        ],
      });

      const res = await getRepostUsers({ tokenId: 1 });
      expect(res.result[0].avatarImageUrl).toBe('fallback.png');
    });

    it('includes pagination in response', async () => {
      mockGet.mockResolvedValueOnce({
        result: [],
        pagination: { page: 1, limit: 20, totalCount: 0, hasMore: false },
      });

      const res = await getRepostUsers({ tokenId: 1 });
      expect(res.pagination).toBeDefined();
      expect(res.pagination!.hasMore).toBe(false);
    });
  });

  describe('createQuotePost', () => {
    it('sends FormData to /quote_post', async () => {
      const mockFormData = new FormData();
      mockPost.mockResolvedValueOnce({
        r: '0xr',
        s: '0xs',
        v: 28,
        createdTokenId: 99,
        timestamp: 12345,
        quotedTokenId: 42,
        isQuotePost: true,
      });

      const res = await createQuotePost(mockFormData);
      expect(mockPost).toHaveBeenCalledWith('/quote_post', mockFormData, {
        isAuthRequired: true,
      });
      expect(res.createdTokenId).toBe(99);
      expect(res.isQuotePost).toBe(true);
    });

    it('unwraps data wrapper', async () => {
      mockPost.mockResolvedValueOnce({
        data: { r: '0xr', s: '0xs', v: 28, createdTokenId: 5 },
      });

      const res = await createQuotePost(new FormData());
      expect(res.createdTokenId).toBe(5);
    });
  });

  describe('getQuotePosts', () => {
    it('passes tokenId and pagination in query', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ id: 1 }] });

      await getQuotePosts({ tokenId: 42, page: 2, limit: 5 });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('tokenId=42');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=5');
    });

    it('returns empty array for non-array result', async () => {
      mockGet.mockResolvedValueOnce({ result: null });
      const res = await getQuotePosts({ tokenId: 1 });
      expect(res.result).toEqual([]);
    });
  });
});
