/**
 * The marketplace endpoints, and the two things easy to get wrong about them.
 *
 * **The prefix.** `env.API_URL` already ends in `/api`, so paths here are
 * written without it. Web's twin of this file writes the same endpoints *with*
 * `/api`, because its client resolves against the bare origin — a path copied
 * across verbatim becomes `/api/api/username_market/…` and 404s on every call.
 *
 * **What is public and what is not.** Browsing has to work signed out or the
 * grid is empty for anyone who has not logged in; quoting and claiming must
 * not, because they act as the caller. Getting `isAuthRequired` backwards on
 * either is invisible until someone hits it.
 */
import { usernameMarketService } from '../../services/username-market.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: { fetch: jest.fn() },
}));

const mockFetch = apiClient.fetch as jest.Mock;

describe('services/username-market.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never writes the /api prefix the base URL already carries', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await usernameMarketService.config();
    await usernameMarketService.browse({});
    await usernameMarketService.mine();
    await usernameMarketService.createListing({ priceDhb: 1000, replacementUsername: 'x' });
    await usernameMarketService.cancelListing('abc');
    await usernameMarketService.quote('abc');
    await usernameMarketService.claim({ listingId: 'abc', txHash: '0x1', chainId: 8453 });

    for (const call of mockFetch.mock.calls) {
      expect(call[0].startsWith('/username_market/')).toBe(true);
      expect(call[0]).not.toContain('/api/');
    }
  });

  it('lets a signed-out browser read the shop window', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await usernameMarketService.config();
    await usernameMarketService.browse({ search: 'satoshi' });

    for (const call of mockFetch.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ isAuthRequired: false }));
    }
  });

  it('never lets an anonymous caller quote, claim or list', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await usernameMarketService.mine();
    await usernameMarketService.quote('abc');
    await usernameMarketService.claim({ listingId: 'abc', txHash: '0x1', chainId: 8453 });
    await usernameMarketService.createListing({ priceDhb: 1000, replacementUsername: 'x' });
    await usernameMarketService.cancelListing('abc');

    for (const call of mockFetch.mock.calls) {
      // Auth is the client's default, so the assertion is that nothing here
      // opted out of it.
      expect(call[1]?.isAuthRequired).not.toBe(false);
    }
  });

  it('passes browse filters through as query params, dropping empty ones', async () => {
    mockFetch.mockResolvedValueOnce({ result: { listings: [] } });

    await usernameMarketService.browse({ search: '', sort: 'shortest', minPriceDhb: 10_000 });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.params).toEqual(
      expect.objectContaining({ sort: 'shortest', minPriceDhb: 10_000 }),
    );
    // An empty search must not become `search=`, which the server would read as
    // a filter and answer an empty grid to.
    expect(options.params.search).toBeUndefined();
  });

  it('unwraps the { status, result } envelope every endpoint answers with', async () => {
    const quote = {
      listingId: 'abc',
      username: 'satoshi',
      priceDhb: 50_000,
      priceUsd: 50,
      sellerAddress: '0xseller',
      currentUsername: 'buyer_old',
      chains: [{ chainId: 8453, tokenAddress: '0xdhb' }],
    };
    mockFetch.mockResolvedValueOnce({ status: true, result: quote });

    await expect(usernameMarketService.quote('abc')).resolves.toEqual(quote);
  });

  it('sells the handle you are wearing — it never sends a username to list', async () => {
    mockFetch.mockResolvedValueOnce({ result: { id: '1' } });

    await usernameMarketService.createListing({
      priceDhb: 50_000,
      replacementUsername: 'satoshi_two',
      description: 'The original.',
    });

    const [path, options] = mockFetch.mock.calls[0];
    expect(path).toBe('/username_market/listings');
    expect(options.method).toBe('POST');
    // The server reads the seller's handle off their account. A `username` here
    // would be a claim on a string, which is how you sell something you do not
    // hold.
    expect(options.body).not.toHaveProperty('username');
    expect(options.body).toEqual({
      priceDhb: 50_000,
      replacementUsername: 'satoshi_two',
      description: 'The original.',
    });
  });

  it('claims against a hash and a chain, so the server can read the transfer back', async () => {
    mockFetch.mockResolvedValueOnce({ result: { pending: false, username: 'satoshi' } });

    await usernameMarketService.claim({ listingId: 'abc', txHash: '0xdead', chainId: 56 });

    expect(mockFetch).toHaveBeenCalledWith(
      '/username_market/claim',
      expect.objectContaining({
        method: 'POST',
        body: { listingId: 'abc', txHash: '0xdead', chainId: 56 },
      }),
    );
  });

  it('encodes a listing id into the cancel path', async () => {
    mockFetch.mockResolvedValueOnce({ result: {} });

    await usernameMarketService.cancelListing('abc123');

    expect(mockFetch.mock.calls[0][0]).toBe('/username_market/listings/abc123');
    expect(mockFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ method: 'DELETE' }));
  });
});
