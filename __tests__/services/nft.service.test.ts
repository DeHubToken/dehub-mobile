import {
  getNFTs,
  getNFT,
  getSuggestedVideos,
  getCategories,
  getCategoriesCached,
  recordView,
  voteOnNFT,
  postComment,
  getCommentsForToken,
  likeComment,
  editComment,
  deleteComment,
  postGifComment,
  getClaimBountySignature,
  minNft,
  editPost,
  togglePostVisibility,
  deletePost,
  reportContent,
  reportUser,
} from '../../services/nft.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;
const mockDelete = (apiClient as any).delete as jest.Mock;

describe('services/nft.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getNFTs', () => {
    it('builds query params and returns result array', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ name: 'video1' }] });
      const res = await getNFTs({ page: 0, unit: 20, postType: 'video' });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('limit=20');
      expect(url).toContain('postType=video');
      expect(res.result).toHaveLength(1);
    });

    it('handles direct array response', async () => {
      mockGet.mockResolvedValueOnce([{ name: 'v1' }]);
      const res = await getNFTs();
      expect(res.result).toHaveLength(1);
    });

    it('handles data array wrapper', async () => {
      mockGet.mockResolvedValueOnce({ data: [{ name: 'v1' }] });
      const res = await getNFTs();
      expect(res.result).toHaveLength(1);
    });

    it('returns empty for unexpected shape', async () => {
      mockGet.mockResolvedValueOnce({ something: 'else' });
      const res = await getNFTs();
      expect(res.result).toEqual([]);
    });

    it('strips undefined/null params', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getNFTs({ category: undefined, search: '' });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).not.toContain('category');
      expect(url).not.toContain('search');
    });
  });

  describe('getNFT', () => {
    it('fetches single NFT by tokenId', async () => {
      mockGet.mockResolvedValueOnce({ result: { tokenId: '42', name: 'My NFT' } });
      const res = await getNFT(42);
      expect(mockGet.mock.calls[0][0]).toBe('/nft_info/42');
      expect(res.result.name).toBe('My NFT');
    });

    it('throws for null tokenId', async () => {
      await expect(getNFT(null as any)).rejects.toThrow('tokenId required');
    });

    it('passes commentId in query', async () => {
      mockGet.mockResolvedValueOnce({ result: { tokenId: '1' } });
      await getNFT(1, { commentId: 55 });
      expect(mockGet.mock.calls[0][0]).toContain('commentId=55');
    });

    it('wraps bare object into result', async () => {
      mockGet.mockResolvedValueOnce({ tokenId: '1', name: 'bare' });
      const res = await getNFT(1);
      expect(res.result.name).toBe('bare');
    });

    it('throws for invalid response', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ id: 1 }] });
      await expect(getNFT(1)).rejects.toThrow('Invalid single NFT response');
    });
  });

  describe('getSuggestedVideos', () => {
    it('calls /suggested/{tokenId}', async () => {
      mockGet.mockResolvedValueOnce({ result: [{ name: 'v1' }], status: true });
      const res = await getSuggestedVideos(42, { page: 1, limit: 5 });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/suggested/42');
      expect(res.result).toHaveLength(1);
    });

    it('throws for null tokenId', async () => {
      await expect(getSuggestedVideos(null as any)).rejects.toThrow('tokenId required');
    });

    it('handles direct array response', async () => {
      mockGet.mockResolvedValueOnce([{ name: 'v1' }]);
      const res = await getSuggestedVideos(1);
      expect(res.result).toHaveLength(1);
      expect(res.status).toBe(true);
    });

    it('returns empty for unexpected shape', async () => {
      mockGet.mockResolvedValueOnce({ something: 'else' });
      const res = await getSuggestedVideos(1);
      expect(res.result).toEqual([]);
    });
  });

  describe('getCategories', () => {
    it('returns direct array', async () => {
      mockGet.mockResolvedValueOnce(['Music', 'Gaming']);
      const res = await getCategories();
      expect(res).toEqual(['Music', 'Gaming']);
    });

    it('unwraps result array', async () => {
      mockGet.mockResolvedValueOnce({ result: ['Art'] });
      const res = await getCategories();
      expect(res).toEqual(['Art']);
    });

    it('returns empty on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('fail'));
      const res = await getCategories();
      expect(res).toEqual([]);
    });
  });

  describe('getCategoriesCached', () => {
    it('caches result on second call', async () => {
      mockGet.mockResolvedValueOnce(['Music']);
      const first = await getCategoriesCached({ forceRefresh: true });
      const second = await getCategoriesCached();

      expect(first).toEqual(['Music']);
      expect(second).toEqual(['Music']);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    it('force refresh bypasses cache', async () => {
      mockGet.mockResolvedValueOnce(['Music']);
      await getCategoriesCached({ forceRefresh: true });

      mockGet.mockResolvedValueOnce(['Gaming']);
      const res = await getCategoriesCached({ forceRefresh: true });
      expect(res).toEqual(['Gaming']);
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordView', () => {
    it('calls /record-view/{tokenId}', async () => {
      mockGet.mockResolvedValueOnce({});
      await recordView(42);
      expect(mockGet.mock.calls[0][0]).toBe('/record-view/42');
    });

    it('silently ignores null tokenId', async () => {
      await recordView(null as any);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('swallows errors silently', async () => {
      mockGet.mockRejectedValueOnce(new Error('fail'));
      await expect(recordView(1)).resolves.toBeUndefined();
    });
  });

  describe('voteOnNFT', () => {
    it('sends vote to /request_vote as a string, since the backend treats a boolean false body value as missing', async () => {
      mockPost.mockResolvedValueOnce({});
      await voteOnNFT({ streamTokenId: 42, vote: true });
      expect(mockPost).toHaveBeenCalledWith(
        '/request_vote',
        { streamTokenId: 42, vote: 'true' },
        { isAuthRequired: true },
      );
    });

    it('returns undefined for null streamTokenId', async () => {
      const res = await voteOnNFT({ streamTokenId: null as any, vote: true });
      expect(res).toBeUndefined();
    });
  });

  describe('postComment', () => {
    it('sends comment to /request_comment', async () => {
      mockPost.mockResolvedValueOnce({ result: { id: 1 } });
      await postComment({ streamTokenId: 42, content: 'hello' });
      expect(mockPost).toHaveBeenCalledWith(
        '/request_comment',
        { streamTokenId: 42, content: 'hello' },
        { isAuthRequired: true },
      );
    });

    it('throws for null streamTokenId', async () => {
      await expect(postComment({ streamTokenId: null as any, content: 'hi' })).rejects.toThrow('streamTokenId required');
    });

    it('throws for empty content', async () => {
      await expect(postComment({ streamTokenId: 1, content: '  ' })).rejects.toThrow('content required');
    });

    it('includes commentId for replies', async () => {
      mockPost.mockResolvedValueOnce({ result: { id: 2 } });
      await postComment({ streamTokenId: 1, content: 'reply', commentId: 5 });
      expect(mockPost.mock.calls[0][1]).toMatchObject({ commentId: 5 });
    });
  });

  describe('getCommentsForToken', () => {
    it('fetches comments with query params', async () => {
      mockGet.mockResolvedValueOnce({ result: { items: [], totalCount: 0, skip: 0, limit: 20, hasMore: false } });
      await getCommentsForToken(42, { skip: 0, limit: 20 });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/nft/42/comments');
    });

    it('throws for null tokenId', async () => {
      await expect(getCommentsForToken(null as any)).rejects.toThrow('tokenId required');
    });

    it('wraps direct array response', async () => {
      mockGet.mockResolvedValueOnce([{ id: 1, content: 'hi' }]);
      const res = await getCommentsForToken(1);
      expect(res.result.items).toHaveLength(1);
    });

    it('returns empty for unexpected shape', async () => {
      mockGet.mockResolvedValueOnce({ something: 'else' });
      const res = await getCommentsForToken(1);
      expect(res.result.items).toEqual([]);
    });
  });

  describe('likeComment', () => {
    it('sends like request', async () => {
      mockPost.mockResolvedValueOnce({ result: true, liked: true, likes: 5 });
      const res = await likeComment({ commentId: 10 });
      expect(res.liked).toBe(true);
    });

    it('throws for null commentId', async () => {
      await expect(likeComment({ commentId: null as any })).rejects.toThrow('commentId required');
    });
  });

  describe('editComment', () => {
    it('edits comment via query params', async () => {
      mockPost.mockResolvedValueOnce({ result: true, commentId: 5, content: 'updated', edited: true });
      const res = await editComment({ commentId: 5, content: 'updated' });
      expect(res.edited).toBe(true);
    });

    it('throws for empty content', async () => {
      await expect(editComment({ commentId: 1, content: '  ' })).rejects.toThrow('content required');
    });
  });

  describe('deleteComment', () => {
    it('deletes comment', async () => {
      mockDelete.mockResolvedValueOnce({ result: true, commentId: 5, deletedCount: 1 });
      const res = await deleteComment({ commentId: 5 });
      expect(res.deletedCount).toBe(1);
    });
  });

  describe('postGifComment', () => {
    it('sends gif comment', async () => {
      mockPost.mockResolvedValueOnce({ result: true, commentId: 10 });
      await postGifComment({ streamTokenId: 1, gifUrl: 'https://gif.com/cat.gif' });
      expect(mockPost.mock.calls[0][1]).toMatchObject({
        streamTokenId: 1,
        gifUrl: 'https://gif.com/cat.gif',
      });
    });

    it('throws for missing gifUrl', async () => {
      await expect(postGifComment({ streamTokenId: 1, gifUrl: '' })).rejects.toThrow('gifUrl required');
    });
  });

  describe('getClaimBountySignature', () => {
    it('fetches bounty signature', async () => {
      mockGet.mockResolvedValueOnce({
        result: { viewer: { v: 28, r: '0xr', s: '0xs' } },
      });
      const res = await getClaimBountySignature(42);
      expect(res.result.viewer).toBeDefined();
    });

    it('throws for null tokenId', async () => {
      await expect(getClaimBountySignature(null as any)).rejects.toThrow('tokenId required');
    });
  });

  describe('minNft (mint)', () => {
    it('posts FormData to /user_mint', async () => {
      const fd = new FormData();
      mockPost.mockResolvedValueOnce({ r: '0xr', s: '0xs', v: 28, createdTokenId: 99 });
      const res = await minNft(fd);
      expect(mockPost).toHaveBeenCalledWith('/user_mint', fd, { isAuthRequired: true });
      expect(res.createdTokenId).toBe(99);
    });
  });

  describe('editPost', () => {
    it('patches NFT data', async () => {
      mockPatch.mockResolvedValueOnce({ result: true });
      const res = await editPost(42, { name: 'Updated' });
      expect(mockPatch.mock.calls[0][0]).toBe('/nft/42');
      expect(res.result).toBe(true);
    });

    it('throws for null tokenId', async () => {
      await expect(editPost(null as any, { name: 'x' })).rejects.toThrow('tokenId required');
    });
  });

  describe('togglePostVisibility', () => {
    it('sends visibility toggle', async () => {
      mockPost.mockResolvedValueOnce({ result: true });
      await togglePostVisibility(42, true);
      expect(mockPost.mock.calls[0][1]).toMatchObject({ id: 42, isHidden: true });
    });
  });

  describe('deletePost', () => {
    it('deletes NFT', async () => {
      mockDelete.mockResolvedValueOnce({ result: true });
      const res = await deletePost(42);
      expect(mockDelete.mock.calls[0][0]).toBe('/nft/42');
      expect(res.result).toBe(true);
    });
  });

  describe('reportContent', () => {
    it('reports content', async () => {
      mockPost.mockResolvedValueOnce({ result: true, message: 'Reported' });
      const res = await reportContent({ tokenId: 42, reason: 'spam' });
      expect(res.result).toBe(true);
    });

    it('throws for null tokenId', async () => {
      await expect(reportContent({ tokenId: null as any, reason: 'spam' })).rejects.toThrow('tokenId required');
    });
  });

  describe('reportUser', () => {
    it('reports user', async () => {
      mockPost.mockResolvedValueOnce({ result: true });
      await reportUser({ userId: 'u1', reason: 'harassment' });
      expect(mockPost.mock.calls[0][1]).toMatchObject({ userId: 'u1', reason: 'harassment' });
    });

    it('throws for empty userId', async () => {
      await expect(reportUser({ userId: '', reason: 'spam' })).rejects.toThrow('userId required');
    });
  });
});
