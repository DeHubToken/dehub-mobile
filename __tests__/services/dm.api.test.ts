import { apiClient } from '../../libs/api.client';
import { getAccountSummaries } from '../../services/user.service';
import {
  getContactsByAddress,
  mergeDmUserProfile,
} from '../../services/dm/dm.api';

jest.mock('../../libs/api.client', () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../libs/assets.util', () => ({
  getFileName: jest.fn(() => 'file'),
  guessMime: jest.fn(() => 'application/octet-stream'),
}));

jest.mock('../../services/user.service', () => ({
  getAccountSummaries: jest.fn(),
}));

const mockGet = apiClient.get as jest.Mock;
const mockGetAccountSummaries = getAccountSummaries as jest.Mock;

describe('DM contact identity enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normalizes badge aliases from an account profile', () => {
    const merged = mergeDmUserProfile(
      { _id: 'peer', username: 'alice', address: '0xpeer' },
      {
        display_name: 'Alice',
        avatar_url: '/alice.jpg',
        badge_balance: 25000,
        badge_lock: { tier: 'Lobster', requirement: 25000 },
      },
    );

    expect(merged).toMatchObject({
      displayName: 'Alice',
      avatarImageUrl: '/alice.jpg',
      badgeBalance: 25000,
      badgeLock: { tier: 'Lobster', requirement: 25000 },
    });
  });

  it('fills a thin contacts participant from account_info', async () => {
    mockGet.mockResolvedValue([{
      _id: 'conversation-1',
      conversationType: 'dm',
      participants: [
        { participant: { _id: 'me', address: '0xme' } },
        { participant: { _id: 'peer', username: 'alice', address: '0xpeer' } },
      ],
      messages: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    }]);
    mockGetAccountSummaries.mockResolvedValue([{
      address: '0xpeer',
      username: 'alice',
      displayName: 'Alice',
      avatarImageUrl: '/alice.jpg',
      badgeBalance: 50000,
    }]);

    const contacts = await getContactsByAddress('0xME');
    const peer = contacts[0].participants[1].participant;

    expect(mockGet).toHaveBeenCalledWith('/dm/contacts/0xme');
    expect(mockGetAccountSummaries).toHaveBeenCalledWith(['0xpeer']);
    expect(peer.displayName).toBe('Alice');
    expect(peer.badgeBalance).toBe(50000);
  });

  it('keeps the contacts response usable when profile enrichment fails', async () => {
    const contact = {
      _id: 'conversation-2',
      conversationType: 'dm' as const,
      participants: [
        { participant: { _id: 'me', address: '0xme' } },
        { participant: { _id: 'peer', username: 'alice', address: '0xpeer' } },
      ],
      messages: [],
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    };
    mockGet.mockResolvedValue([contact]);
    mockGetAccountSummaries.mockRejectedValue(new Error('offline'));

    await expect(getContactsByAddress('0xme')).resolves.toEqual([contact]);
  });
});
