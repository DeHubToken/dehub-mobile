/**
 * The delegation endpoints, and the prefix that is easy to get wrong.
 *
 * `env.API_URL` already ends in `/api`, so paths here are written without it.
 * Web's twin of this file writes the same endpoints *with* `/api`, because its
 * client resolves against the bare origin — so a path copied across verbatim
 * becomes `/api/api/badge/delegations` and 404s on every call. These
 * assertions are here to catch exactly that.
 */
import {
  fetchMyDelegations,
  grantDelegation,
  revokeDelegation,
  fetchBadgePatron,
} from '../../services/badge-delegation.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: { fetch: jest.fn() },
}));

const mockFetch = apiClient.fetch as jest.Mock;

describe('services/badge-delegation.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never writes the /api prefix the base URL already carries', async () => {
    mockFetch.mockResolvedValue({ result: null });

    await fetchMyDelegations();
    await grantDelegation('someone');
    await revokeDelegation('someone');
    await fetchBadgePatron('someone');

    for (const call of mockFetch.mock.calls) {
      expect(call[0].startsWith('/badge/delegations')).toBe(true);
      expect(call[0]).not.toContain('/api/');
    }
  });

  it('fetchMyDelegations unwraps the summary and requires auth', async () => {
    const summary = {
      address: '0xabc',
      ownBadgeBalance: 5_000_000,
      ownTier: 'Killer Whale',
      effectiveTier: 'Killer Whale',
      slots: 10,
      slotsUsed: 2,
      grantableTier: 'Tiger Shark',
      granted: [],
      received: null,
    };
    mockFetch.mockResolvedValueOnce({ result: summary });

    await expect(fetchMyDelegations()).resolves.toEqual(summary);
    expect(mockFetch).toHaveBeenCalledWith(
      '/badge/delegations',
      expect.objectContaining({ method: 'GET', isAuthRequired: true }),
    );
  });

  it('grantDelegation posts the recipient', async () => {
    mockFetch.mockResolvedValueOnce({ result: { tier: 'Tiger Shark', slotsRemaining: 7 } });

    await expect(grantDelegation('someone')).resolves.toEqual({
      tier: 'Tiger Shark',
      slotsRemaining: 7,
    });
    expect(mockFetch).toHaveBeenCalledWith(
      '/badge/delegations',
      expect.objectContaining({ method: 'POST', body: { to: 'someone' } }),
    );
  });

  it('revokeDelegation encodes the counterparty into the path', async () => {
    mockFetch.mockResolvedValueOnce({ result: { ended: true } });

    await revokeDelegation('some one');
    expect(mockFetch.mock.calls[0][0]).toBe('/badge/delegations/some%20one');
    expect(mockFetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ method: 'DELETE', isAuthRequired: true }),
    );
  });

  it('fetchBadgePatron is anonymous and null for an account wearing its own badge', async () => {
    mockFetch.mockResolvedValueOnce({ result: null });

    await expect(fetchBadgePatron('someone')).resolves.toBeNull();
    expect(mockFetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({ isAuthRequired: false }),
    );
  });

  it('fetchBadgePatron survives a response with no body at all', async () => {
    mockFetch.mockResolvedValueOnce(undefined);
    await expect(fetchBadgePatron('someone')).resolves.toBeNull();
  });
});
