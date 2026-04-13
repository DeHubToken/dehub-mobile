import {
  getAccount,
  usersSearch,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  refreshAccount,
  followUser,
  unfollowUser,
  isFollowing,
  removeFollower,
  getFollowList,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  acceptAllFollowRequests,
  rejectAllFollowRequests,
  getLikedPosts,
  getMyPosts,
  getSavedPosts,
  getUnlockedPosts,
  getUserReplies,
  getSuggestedAccounts,
  getUserReposts,
} from '../../services/user.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../services/nft.service', () => ({
  getNFTs: jest.fn().mockResolvedValue({ result: [] }),
}));

const mockGet = apiClient.get as jest.Mock;
const mockPost = apiClient.post as jest.Mock;
const mockPatch = apiClient.patch as jest.Mock;

describe('services/user.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAccount', () => {
    it('calls /account_info with encoded username', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: { result: { username: 'alice' } } });
      await getAccount('alice');
      expect(mockGet.mock.calls[0][0]).toBe('/account_info/alice');
    });

    it('encodes special characters', async () => {
      mockGet.mockResolvedValueOnce({ success: true });
      await getAccount('user name');
      expect(mockGet.mock.calls[0][0]).toBe('/account_info/user%20name');
    });
  });

  describe('usersSearch', () => {
    it('returns mapped users when successful', async () => {
      mockGet.mockResolvedValueOnce({
        success: true,
        data: { result: [{ username: 'alice' }, { username: 'bob' }] },
      });

      const res = await usersSearch('ali');
      expect(res.data.result).toHaveLength(2);
    });

    it('returns raw response when not successful', async () => {
      const raw = { success: false, data: { result: [] }, message: 'no results' };
      mockGet.mockResolvedValueOnce(raw);

      const res = await usersSearch('zzz');
      expect(res).toEqual(raw);
    });
  });

  describe('getNotifications', () => {
    it('calls /notification without params', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: { result: [] } });
      await getNotifications();
      expect(mockGet.mock.calls[0][0]).toBe('/notification');
    });

    it('passes category and page as query params', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: { result: [] } });
      await getNotifications({ category: 'social', page: 2, limit: 10 });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('category=social');
      expect(url).toContain('page=2');
      expect(url).toContain('limit=10');
    });

    it('includes unreadOnly=false when explicitly set', async () => {
      mockGet.mockResolvedValueOnce({ success: true, data: { result: [] } });
      await getNotifications({ unreadOnly: false });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('unreadOnly=false');
    });
  });

  describe('markNotificationAsRead', () => {
    it('returns null for empty id', async () => {
      const res = await markNotificationAsRead('');
      expect(res).toBeNull();
      expect(mockPatch).not.toHaveBeenCalled();
    });

    it('calls PATCH on specific notification', async () => {
      mockPatch.mockResolvedValueOnce({ success: true });
      await markNotificationAsRead('notif-123');
      expect(mockPatch.mock.calls[0][0]).toBe('/notification/notif-123');
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('calls /notification/mark-all-read without category', async () => {
      mockPost.mockResolvedValueOnce({ message: 'done', count: 5 });
      await markAllNotificationsAsRead();
      expect(mockPost.mock.calls[0][0]).toBe('/notification/mark-all-read');
    });

    it('includes category query param', async () => {
      mockPost.mockResolvedValueOnce({ message: 'done', count: 2 });
      await markAllNotificationsAsRead('engagement');
      const url = mockPost.mock.calls[0][0] as string;
      expect(url).toContain('category=engagement');
    });
  });

  describe('refreshAccount', () => {
    it('returns null for null user', async () => {
      const res = await refreshAccount(null);
      expect(res).toBeNull();
    });

    it('returns current user when no identifier', async () => {
      const user = { username: '', walletAddress: '' } as any;
      const res = await refreshAccount(user);
      expect(res).toEqual(user);
    });

    it('returns fresh user on success', async () => {
      mockGet.mockResolvedValueOnce({
        success: true,
        data: { result: { username: 'alice', walletAddress: '0x1' } },
      });
      const res = await refreshAccount({ username: 'alice' } as any);
      expect((res as any).username).toBe('alice');
    });

    it('returns current user on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('offline'));
      const user = { username: 'alice' } as any;
      const res = await refreshAccount(user);
      expect(res).toEqual(user);
    });
  });

  describe('followUser / unfollowUser', () => {
    it('follows a user', async () => {
      mockGet.mockResolvedValueOnce({ result: { status: 'following' } });
      const res = await followUser('0xme', '0xtarget');
      expect(res.status).toBe('following');
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('address=0xme');
      expect(url).toContain('following=0xtarget');
    });

    it('unfollows a user', async () => {
      mockGet.mockResolvedValueOnce({ result: { status: 'unfollowed' } });
      const res = await unfollowUser('0xme', '0xtarget');
      expect(res.status).toBe('unfollowed');
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('unFollowing=true');
    });

    it('defaults status when missing', async () => {
      mockGet.mockResolvedValueOnce({});
      const res = await followUser('0xme', '0xtarget');
      expect(res.status).toBe('following');
    });
  });

  describe('isFollowing', () => {
    it('returns false for empty address', async () => {
      const res = await isFollowing('');
      expect(res.isFollowing).toBe(false);
      expect(mockGet).not.toHaveBeenCalled();
    });

    it('returns following status', async () => {
      mockGet.mockResolvedValueOnce({ isFollowing: true, isFollowRequestPending: false });
      const res = await isFollowing('0xabc');
      expect(res.isFollowing).toBe(true);
    });

    it('returns false on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('fail'));
      const res = await isFollowing('0xabc');
      expect(res.isFollowing).toBe(false);
    });
  });

  describe('removeFollower', () => {
    it('sends POST to /followers/remove', async () => {
      mockPost.mockResolvedValueOnce({ result: { status: true, message: 'Removed' } });
      const res = await removeFollower('0xspam');
      expect(mockPost).toHaveBeenCalledWith(
        '/followers/remove',
        { address: '0xspam' },
        { isAuthRequired: true },
      );
      expect(res.status).toBe(true);
    });
  });

  describe('getFollowList', () => {
    it('builds correct URL with all params', async () => {
      mockGet.mockResolvedValueOnce({ status: true, result: { items: [], pagination: {} } });
      await getFollowList({
        address: '0xabc',
        type: 'followers',
        page: 2,
        limit: 10,
        search: 'al',
        sortBy: 'username',
        sortOrder: 'asc',
      });

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/follow_list/0xabc');
      expect(url).toContain('type=followers');
      expect(url).toContain('search=al');
      expect(url).toContain('sortBy=username');
    });
  });

  describe('getFollowRequests', () => {
    it('returns normalised structure', async () => {
      mockGet.mockResolvedValueOnce({ status: true, items: [{ requestId: 'r1' }] });
      const res = await getFollowRequests(1, 5);

      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('page=1');
      expect(url).toContain('limit=5');
      expect(res.items).toHaveLength(1);
    });

    it('defaults to empty items when missing', async () => {
      mockGet.mockResolvedValueOnce({});
      const res = await getFollowRequests();
      expect(res.items).toEqual([]);
    });
  });

  describe('acceptFollowRequest / rejectFollowRequest', () => {
    it('calls accept endpoint', async () => {
      mockPost.mockResolvedValueOnce({ success: true });
      await acceptFollowRequest('req-1');
      expect(mockPost.mock.calls[0][0]).toBe('/follow-requests/req-1/accept');
    });

    it('calls reject endpoint', async () => {
      mockPost.mockResolvedValueOnce({ success: true });
      await rejectFollowRequest('req-2');
      expect(mockPost.mock.calls[0][0]).toBe('/follow-requests/req-2/reject');
    });
  });

  describe('acceptAllFollowRequests / rejectAllFollowRequests', () => {
    it('accept-all returns data', async () => {
      mockPost.mockResolvedValueOnce({ data: { status: true, message: 'done', accepted: 3 } });
      const res = await acceptAllFollowRequests();
      expect(res.accepted).toBe(3);
    });

    it('reject-all returns data', async () => {
      mockPost.mockResolvedValueOnce({ status: true, message: 'done', rejected: 2 });
      const res = await rejectAllFollowRequests();
      expect(res.rejected).toBe(2);
    });
  });

  describe('paginated post lists (getLikedPosts, getMyPosts, getSavedPosts, getUnlockedPosts)', () => {
    const endpoints = [
      { fn: getLikedPosts, path: '/liked_videos' },
      { fn: getMyPosts, path: '/myPosts' },
      { fn: getSavedPosts, path: '/savedPosts' },
      { fn: getUnlockedPosts, path: '/unlockedPosts' },
    ];

    endpoints.forEach(({ fn, path }) => {
      it(`${fn.name} uses 1-indexed page`, async () => {
        mockGet.mockResolvedValueOnce({ result: [{ id: 1 }] });
        await fn({ page: 0, unit: 10 });

        const url = mockGet.mock.calls[0][0] as string;
        expect(url).toContain(path);
        expect(url).toContain('page=1');
        expect(url).toContain('limit=10');
      });

      it(`${fn.name} handles nested result shapes`, async () => {
        mockGet.mockResolvedValueOnce({ data: { result: [{ id: 1 }] } });
        const res = await fn();
        expect(res.result).toHaveLength(1);
      });

      it(`${fn.name} handles items wrapper`, async () => {
        mockGet.mockResolvedValueOnce({ result: { items: [{ id: 1 }] } });
        const res = await fn();
        expect(res.result).toHaveLength(1);
      });
    });
  });

  describe('getUserReplies', () => {
    it('passes address and pagination', async () => {
      mockGet.mockResolvedValueOnce({
        result: { items: [{ id: 1 }], pagination: { page: 1 } },
      });

      const res = await getUserReplies({ address: '0xabc', page: 1, limit: 10, type: 'reply' });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/users/0xabc/comments');
      expect(url).toContain('type=reply');
      expect(res.result.items).toHaveLength(1);
    });

    it('defaults pagination when missing', async () => {
      mockGet.mockResolvedValueOnce({});
      const res = await getUserReplies({ address: '0x1' });
      expect(res.result.items).toEqual([]);
      expect(res.result.pagination.hasMore).toBe(false);
    });
  });

  describe('getSuggestedAccounts', () => {
    it('returns items from result wrapper', async () => {
      mockGet.mockResolvedValueOnce({
        result: { items: [{ address: '0x1', reason: 'follows_you' }] },
      });
      const res = await getSuggestedAccounts();
      expect(res).toHaveLength(1);
    });

    it('returns empty array on error', async () => {
      mockGet.mockRejectedValueOnce(new Error('fail'));
      const res = await getSuggestedAccounts();
      expect(res).toEqual([]);
    });
  });

  describe('getUserReposts (user.service version)', () => {
    it('calls /user/{address}/reposts', async () => {
      mockGet.mockResolvedValueOnce({ result: [] });
      await getUserReposts({ address: '0xabc', page: 1, limit: 10 });
      const url = mockGet.mock.calls[0][0] as string;
      expect(url).toContain('/user/0xabc/reposts');
    });

    it('returns empty array for non-array result', async () => {
      mockGet.mockResolvedValueOnce({ result: null });
      const res = await getUserReposts({ address: '0x1' });
      expect(res.result).toEqual([]);
    });
  });
});
