/**
 * The account-market endpoints, and the things easy to get wrong about them.
 *
 * **The prefix.** `env.API_URL` already ends in `/api`, so paths here are
 * written without it. Web's twin of this file writes the same endpoints *with*
 * `/api` — a path copied across verbatim becomes `/api/api/account_market/…`
 * and 404s on every call.
 *
 * **What is public and what is not.** Browsing has to work signed out or the
 * list is empty for anyone who has not logged in; quoting, claiming and the
 * receive-address check must not, because they act as the caller.
 *
 * **The receive address is optional on claim.** Omitting it means "deliver to
 * the paying wallet" — the fresh-wallet-buys-for-itself path — and sending an
 * empty string instead would be rejected as an invalid address.
 */
import { accountMarketService } from '../../services/account-market.service';
import { apiClient } from '../../libs/api.client';

jest.mock('../../libs/api.client', () => ({
  apiClient: { fetch: jest.fn() },
}));

const mockFetch = apiClient.fetch as jest.Mock;

describe('services/account-market.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never writes the /api prefix the base URL already carries', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await accountMarketService.config();
    await accountMarketService.browse({});
    await accountMarketService.mine();
    await accountMarketService.createListing({ priceDhb: 500_000 });
    await accountMarketService.updateListing('abc', { priceDhb: 400_000 });
    await accountMarketService.cancelListing('abc');
    await accountMarketService.quote('abc');
    await accountMarketService.checkReceive({ listingId: 'abc', receiveAddress: '0x1' });
    await accountMarketService.claim({ listingId: 'abc', txHash: '0x1', chainId: 8453 });

    for (const call of mockFetch.mock.calls) {
      expect(call[0].startsWith('/account_market/')).toBe(true);
      expect(call[0]).not.toContain('/api/');
    }
  });

  it('lets a signed-out browser read the shop window', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await accountMarketService.config();
    await accountMarketService.browse({ search: 'satoshi' });

    for (const call of mockFetch.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({ isAuthRequired: false }));
    }
  });

  it('never lets an anonymous caller quote, check delivery, claim or list', async () => {
    mockFetch.mockResolvedValue({ result: {} });

    await accountMarketService.mine();
    await accountMarketService.quote('abc');
    await accountMarketService.checkReceive({ listingId: 'abc', receiveAddress: '0x1' });
    await accountMarketService.claim({ listingId: 'abc', txHash: '0x1', chainId: 8453 });
    await accountMarketService.createListing({ priceDhb: 500_000 });
    await accountMarketService.cancelListing('abc');

    for (const call of mockFetch.mock.calls) {
      // Auth is the client's default, so the assertion is that nothing here
      // opted out of it.
      expect(call[1]?.isAuthRequired).not.toBe(false);
    }
  });

  it('passes browse filters through as query params, dropping empty ones', async () => {
    mockFetch.mockResolvedValueOnce({ result: { listings: [] } });

    await accountMarketService.browse({ search: '', sort: 'followers', minPriceDhb: 100_000 });

    const [, options] = mockFetch.mock.calls[0];
    expect(options.params).toEqual(
      expect.objectContaining({ sort: 'followers', minPriceDhb: 100_000 }),
    );
    // An empty search must not become `search=`, which the server would read as
    // a filter and answer an empty list to.
    expect(options.params.search).toBeUndefined();
  });

  it('sells the account you are signed in as — it never sends an account to list', async () => {
    mockFetch.mockResolvedValueOnce({ result: { id: '1' } });

    await accountMarketService.createListing({
      priceDhb: 500_000,
      description: 'Established 2021. Clean history.',
    });

    const [path, options] = mockFetch.mock.calls[0];
    expect(path).toBe('/account_market/listings');
    expect(options.method).toBe('POST');
    // The server reads the seller off their token. A `username` or address
    // here would be a claim on somebody else's account.
    expect(options.body).not.toHaveProperty('username');
    expect(options.body).not.toHaveProperty('address');
    expect(options.body).toEqual({
      priceDhb: 500_000,
      description: 'Established 2021. Clean history.',
    });
  });

  it('omits receiveAddress on claim when delivery goes to the paying wallet', async () => {
    mockFetch.mockResolvedValueOnce({ result: { pending: true, username: 'x' } });

    await accountMarketService.claim({ listingId: 'abc', txHash: '0x1', chainId: 8453 });

    const [, options] = mockFetch.mock.calls[0];
    // `undefined`, not an empty string — the server validates any present
    // value as an address and '' would fail a purchase that has already paid.
    expect(options.body.receiveAddress).toBeUndefined();
  });
});
